import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { db1Admin, db2Admin, db3Admin } from "@/server/db/clients.server";
import { auditMutation } from "@/lib/platform-access.server";

const SYSTEM = `You are an expert at writing knowledge bases for AI assistants. From the supplied business website content, write a concise factual Markdown draft. Never invent facts. Keep it under 600 words.`;

export const generateKnowledgeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        content: z.string().min(40).max(60000),
        businessName: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { routeChat } = await import("@/lib/llm-router.server");
    const routed = await routeChat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Business: ${data.businessName || "unknown"}\n\nWebsite content:\n${data.content}`,
        },
      ],
      { maxTokens: 900 },
      undefined,
    );
    if (!routed?.reply)
      return { error: "The AI returned an empty draft. Try adding more website content." };
    return { draft: routed.reply };
  });

export const saveKnowledgeDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { data: automation, error: aErr } = await db2Admin
      .from("client_automations")
      .select("id,client_id")
      .eq("id", data.automationId)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!automation) throw new Error("Automation not found");
    if (!context.tenant.isSuperAdmin && automation.client_id !== context.tenant.clientId)
      throw new Response("Forbidden", { status: 403 });
    const { data: kb } = await db3Admin
      .from("knowledge_bases")
      .select("id")
      .eq("automation_id", data.automationId)
      .maybeSingle();
    if (!kb?.id) throw new Error("Knowledge base is not initialized yet.");
    const { data: doc, error } = await db3Admin
      .from("kb_documents")
      .insert({
        knowledge_base_id: kb.id,
        client_id: automation.client_id,
        automation_id: data.automationId,
        source_type: "manual_text",
        source_name: data.title,
        content: data.content,
        status: "processing",
        metadata: { generated: true },
      })
      .select("id,source_name,created_at,status")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Could not save knowledge document");
    const { indexKnowledgeDocument } = await import("@/lib/rag.server");
    const indexed = await indexKnowledgeDocument(doc.id);
    await db3Admin
      .from("kb_documents")
      .update({
        status: indexed.embedded > 0 ? "completed" : "error",
        error: indexed.embedded > 0 ? null : "No embedding provider available",
      })
      .eq("id", doc.id);
    await auditMutation(context, {
      action: "knowledge.draft.saved",
      targetId: data.automationId,
      targetType: "automation",
      after: { document_id: doc.id, title: data.title },
      clientId: automation.client_id,
    });
    return {
      ok: true,
      document: { ...doc, status: indexed.embedded > 0 ? "completed" : "error" },
      chunks: indexed,
    };
  });

export const scrapeUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ url: z.string().min(4).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    let target: URL;
    try {
      target = new URL(/^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`);
    } catch {
      return { error: "That doesn't look like a valid web address." };
    }
    try {
      const { assertPublicHost } = await import("@/lib/safe-fetch.server");
      await assertPublicHost(target.hostname);
    } catch {
      return { error: "That address isn't allowed." };
    }
    const { crawl } = await import("./provisioning.server");
    const page = await crawl(target.toString());
    if (!page.ok || !page.text)
      return { error: "Couldn't read that page. Check the address or paste the text instead." };
    await db1Admin.from("user_activity_events").insert({
      user_id: context.userId,
      client_id: context.tenant.clientId,
      event_type: "knowledge.scrape",
      metadata: { url: page.url },
    });
    return { title: page.title, url: page.url, text: page.text };
  });
