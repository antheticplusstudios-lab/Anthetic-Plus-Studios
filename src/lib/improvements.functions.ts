import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertTenantActive } from "@/lib/rbac.server";
import { db2Admin, db3Admin } from "@/server/db/clients.server";

/**
 * "Test your receptionist": the signed-in client (or staff) chats with their own
 * automation using the exact same prompt + knowledge as the live widget.
 * Nothing is written to transcripts or counters.
 */
export const testReceptionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        automationId: z.string().uuid(),
        message: z.string().min(1).max(2000),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(20)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertTenantActive(context);
    const { data: inst, error } = await db2Admin.from("client_automations")
      .select("*")
      .eq("id", data.automationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inst) return { error: "Automation not found." };
    if (!context.tenant.isStaff && String(inst.client_id) !== context.tenant.clientId) return { error: "Automation not found." };

    const { buildSystemPrompt, runtimeState, adminClient } = await import("./widget.server");
    const { routeChat } = await import("./llm-router.server");
    const runtime = adminClient();
    const state = await runtimeState(runtime, data.automationId);
    if (state !== "active") return { error: "This assistant is not currently available." };

    const installation = {
      id: String(inst.id), client_id: String(inst.client_id), automation_type: String(inst.automation_type),
      name: String(inst.name ?? ""), domain_url: String(inst.domain_url ?? ""), allowed_domains: Array.isArray(inst.allowed_domains) ? inst.allowed_domains.map(String) : [],
      run_state: String(inst.run_state), is_active: Boolean(inst.is_active), requires_reinstallation: Boolean(inst.requires_reinstallation),
      expires_at: inst.expires_at ? String(inst.expires_at) : null, widget_config: (inst.widget_config ?? {}) as Record<string, unknown>,
      subscription_status: "active", token: "test",
    };
    const system = await buildSystemPrompt(runtime, installation);
    const routed = await routeChat(
      [{ role: "system", content: system }, ...data.history.slice(-8), { role: "user", content: data.message }],
      { automationId: data.automationId, clientId: context.tenant.clientId },
      db3Admin,
    );
    if (!routed?.reply) return { error: "The assistant is temporarily unavailable. Try again in a moment." };
    return { reply: routed.reply, model: routed.model };
  });

/** Knowledge Drafts: pull readable text from any public web page. Admin only. */
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
    try { const { assertPublicHost } = await import("@/lib/safe-fetch.server"); await assertPublicHost(target.hostname); } catch {
      return { error: "That address isn't allowed." };
    }
    const { crawl } = await import("./provisioning.server");
    const page = await crawl(target.toString());
    if (!page.ok || !page.text) return { error: "Couldn't read that page. Check the address or paste the text instead." };
    return { title: page.title, url: page.url, text: page.text };
  });
