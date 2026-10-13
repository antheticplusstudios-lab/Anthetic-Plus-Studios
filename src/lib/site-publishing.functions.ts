/** Admin RPCs for the shared Website AI Agent: draft, test, publish, rollback, domains, knowledge review. */
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { SITE_IDS } from "@/assistant/sites/site-registry";
import type { AssistantResponse } from "@/assistant/assistant.types";
import type { SiteConfig } from "@/assistant/sites/site-config.types";

const siteSchema = z.enum(SITE_IDS);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function audit(
  ctx: { userId: string },
  siteId: string,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  return auditMutation(ctx, {
    action: `web_agent.${action}`,
    targetType: "web_assistant_site",
    targetId: siteId,
    metadata: { siteId, ...metadata },
  }).catch((e) => console.error("web agent audit failed", e));
}

export const adminGetAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { loadAgent } = await import("@/assistant/sites/site-publishing.server");
    const a = await loadAgent(data.siteId);
    return {
      siteId: data.siteId,
      state: a.state,
      changed: a.changed,
      blockers: a.blockers,
      live: a.live,
      working: a.working,
      draftUpdatedAt: a.draft?.updatedAt ?? null,
      liveUpdatedAt: a.liveUpdatedAt,
      lastError: a.history.lastError,
      versions: a.history.versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        note: v.note,
        rolledBackFrom: v.rolledBackFrom,
      })),
      domains: a.domains.domains,
      knowledge: a.knowledge.map((k) => ({
        id: k.id,
        title: k.title,
        content: k.content.slice(0, 600),
        kind: k.kind,
        category: k.category,
        status: k.status,
        updatedAt: k.updatedAt,
      })),
    };
  });

export const adminDiscardDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { discardDraft } = await import("@/assistant/sites/site-publishing.server");
    await discardDraft(data.siteId);
    await audit(context, data.siteId, "draft.discarded");
    return { ok: true };
  });

export const adminPublishAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, note: z.string().trim().max(300).default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { publishDraft } = await import("@/assistant/sites/site-publishing.server");
    const v = await publishDraft(data.siteId, context.userId, data.note);
    await audit(context, data.siteId, "published", { version: v.version });
    return { version: v.version };
  });

export const adminRollbackAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, version: z.number().int().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { rollbackTo } = await import("@/assistant/sites/site-publishing.server");
    const v = await rollbackTo(data.siteId, data.version, context.userId);
    await audit(context, data.siteId, "rolled_back", { to: data.version, newVersion: v.version });
    return { version: v.version };
  });

export const adminAddDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        domain: z
          .string()
          .trim()
          .toLowerCase()
          .refine((v) => HOST_RE.test(v), "Use a bare domain like example.com"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { requestDomain } = await import("@/assistant/sites/site-publishing.server");
    const r = await requestDomain(data.siteId, data.domain);
    await audit(context, data.siteId, "domain.requested", { domain: data.domain });
    return r;
  });

export const adminCheckDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, domain: z.string().trim().toLowerCase().max(253) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { checkDomain } = await import("@/assistant/sites/site-publishing.server");
    const r = await checkDomain(data.siteId, data.domain);
    await audit(context, data.siteId, "domain.checked", {
      domain: data.domain,
      verified: !!r.verifiedAt,
    });
    return r;
  });

export const adminRemoveDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, domain: z.string().trim().toLowerCase().max(253) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { removeDomain } = await import("@/assistant/sites/site-publishing.server");
    await removeDomain(data.siteId, data.domain);
    await audit(context, data.siteId, "domain.removed", { domain: data.domain });
    return { ok: true };
  });

/** Explicit knowledge review. Only "approve" makes an item usable by the live agent. */
export const adminReviewKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        itemId: z.string().max(64),
        action: z.enum(["approve", "reject", "disable"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { reviewStatus } = await import("@/assistant/sites/site-publishing");
    const { loadSiteConfig, saveSiteConfig } = await import("@/assistant/sites/site-config.server");
    const { syncKnowledgeSnapshot } = await import("@/assistant/sites/site-knowledge.server");
    const c = await loadSiteConfig(data.siteId);
    if (!c.knowledge.some((k) => k.id === data.itemId))
      throw new Error("Knowledge item not found for this site.");
    const status = reviewStatus(data.action);
    const saved = await saveSiteConfig(data.siteId, {
      ...c,
      knowledge: c.knowledge.map((k) =>
        k.id === data.itemId ? { ...k, status, updatedAt: new Date().toISOString() } : k,
      ),
    });
    await syncKnowledgeSnapshot(data.siteId, saved);
    await audit(context, data.siteId, `knowledge.${data.action}`, { itemId: data.itemId });
    return { ok: true, status };
  });

/** Test console: runs the real engine as a signed-out visitor, using either the draft or the live settings. */
export const adminTestAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        target: z.enum(["draft", "live"]),
        message: z.string().trim().min(1).max(1200),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(24)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    assertAdmin(context);
    const requestId = randomUUID();
    try {
      const { loadAgent } = await import("@/assistant/sites/site-publishing.server");
      const { loadSiteConfig } = await import("@/assistant/sites/site-config.server");
      const { runAssistant } = await import("@/assistant/assistant.service.server");
      const [live, agent] = await Promise.all([
        loadSiteConfig(data.siteId),
        loadAgent(data.siteId),
      ]);
      const config: SiteConfig = data.target === "draft" ? { ...live, ...agent.working } : live;
      return await runAssistant({
        auth: null,
        history: data.history,
        message: data.message,
        requestId,
        site: { id: data.siteId, config },
      });
    } catch (e) {
      console.error(`[agent test ${requestId}]`, e);
      return {
        ok: false,
        error: { code: "internal", message: "The test failed. Please try again." },
        requestId,
      };
    }
  });
