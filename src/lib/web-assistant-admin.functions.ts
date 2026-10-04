/**
 * Admin RPCs for the two Web Assistant sites. Every call re-checks admin RBAC
 * on the server and only ever reads/writes the one site named in the request.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { SITE_IDS } from "@/assistant/sites/site-registry";
import { loadSiteConfig, saveSiteConfig } from "@/assistant/sites/site-config.server";
import { scanSource, sourceAllowed } from "@/assistant/sites/site-knowledge.server";
import { siteForStaffPreview } from "@/assistant/sites/site-context.server";
import { runAssistant } from "@/assistant/assistant.service.server";
import type { AssistantResponse } from "@/assistant/assistant.types";
import type { KnowledgeItem, SiteConfig } from "@/assistant/sites/site-config.types";

const siteSchema = z.enum(SITE_IDS);

function audit(ctx: { userId: string }, siteId: string, action: string, metadata: Record<string, unknown> = {}) {
  return auditMutation(ctx, { action: `web_assistant.${action}`, targetType: "web_assistant_site", targetId: siteId, metadata: { siteId, ...metadata } }).catch((e) =>
    console.error("web assistant audit failed", e),
  );
}

export const adminGetSiteConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    return { siteId: data.siteId, config: await loadSiteConfig(data.siteId) };
  });

/** Saves settings fields. Knowledge and sources are managed by their own RPCs and preserved here. */
export const adminSaveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, config: z.record(z.string(), z.unknown()) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const current = await loadSiteConfig(data.siteId);
    const next = { ...current, ...data.config, knowledge: current.knowledge, sources: current.sources } as SiteConfig;
    const saved = await saveSiteConfig(data.siteId, next);
    const changed = Object.keys(data.config).filter((k) => JSON.stringify((current as any)[k]) !== JSON.stringify((saved as any)[k]));
    await audit(context, data.siteId, "settings.updated", { fields: changed });
    return { ok: true, config: saved };
  });

const knowledgeSchema = z.object({
  id: z.string().max(64).nullable(),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(["business", "service", "product", "faq", "policy", "contact", "hours", "pricing", "other"]),
  status: z.enum(["approved", "needs_review", "disabled"]),
});

export const adminUpsertKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, item: knowledgeSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    const now = new Date().toISOString();
    const existing = data.item.id ? c.knowledge.find((k) => k.id === data.item.id) : undefined;
    if (data.item.id && !existing) throw new Error("Knowledge item not found for this site.");
    const item: KnowledgeItem = existing
      ? { ...existing, title: data.item.title, content: data.item.content, category: data.item.category, status: data.item.status, updatedAt: now }
      : { id: randomUUID(), title: data.item.title, content: data.item.content, category: data.item.category, status: data.item.status, kind: "manual", sourceId: null, updatedAt: now };
    const knowledge = existing ? c.knowledge.map((k) => (k.id === item.id ? item : k)) : [item, ...c.knowledge];
    const saved = await saveSiteConfig(data.siteId, { ...c, knowledge });
    await audit(context, data.siteId, existing ? "knowledge.updated" : "knowledge.created", { itemId: item.id, status: item.status });
    return { ok: true, config: saved };
  });

export const adminDeleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, id: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!c.knowledge.some((k) => k.id === data.id)) throw new Error("Knowledge item not found for this site.");
    const saved = await saveSiteConfig(data.siteId, { ...c, knowledge: c.knowledge.filter((k) => k.id !== data.id) });
    await audit(context, data.siteId, "knowledge.deleted", { itemId: data.id });
    return { ok: true, config: saved };
  });

export const adminAddSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, url: z.string().trim().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!sourceAllowed(data.siteId, c, data.url)) throw new Error("Sources must be on this site's own domains.");
    if (c.sources.some((s) => s.url === data.url)) throw new Error("That source is already added.");
    const source = { id: randomUUID(), url: data.url, active: true, status: "never_scanned" as const, error: null, lastScanAt: null, lastSuccessAt: null, lastChangeAt: null, contentHash: null, itemCount: 0 };
    const saved = await saveSiteConfig(data.siteId, { ...c, sources: [...c.sources, source] });
    await audit(context, data.siteId, "source.added", { url: data.url });
    return { ok: true, config: saved };
  });

export const adminUpdateSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, id: z.string().max(64), op: z.enum(["enable", "disable", "remove"]) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!c.sources.some((s) => s.id === data.id)) throw new Error("Source not found for this site.");
    const next: SiteConfig =
      data.op === "remove"
        ? { ...c, sources: c.sources.filter((s) => s.id !== data.id), knowledge: c.knowledge.filter((k) => k.sourceId !== data.id) }
        : { ...c, sources: c.sources.map((s) => (s.id === data.id ? { ...s, active: data.op === "enable" } : s)) };
    const saved = await saveSiteConfig(data.siteId, next);
    await audit(context, data.siteId, ({ enable: "source.enabled", disable: "source.disabled", remove: "source.removed" } as const)[data.op], { sourceId: data.id });
    return { ok: true, config: saved };
  });

export const adminScanSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, id: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    const result = await scanSource(data.siteId, c, data.id);
    const saved = await saveSiteConfig(data.siteId, result.config);
    await audit(context, data.siteId, "source.scanned", { sourceId: data.id, changed: result.changed, ok: !result.error });
    return { ok: !result.error, changed: result.changed, error: result.error, config: saved };
  });

/** Staff test console: runs the shared engine as a signed-out visitor of the chosen site. */
export const adminPreviewSiteAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      siteId: siteSchema,
      message: z.string().trim().min(1).max(1200),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(24).default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AssistantResponse> => {
    assertAdmin(context);
    const requestId = randomUUID();
    try {
      return await runAssistant({ auth: null, history: data.history, message: data.message, requestId, site: await siteForStaffPreview(data.siteId) });
    } catch (e) {
      console.error(`[assistant preview ${requestId}]`, e);
      return { ok: false, error: { code: "internal", message: "The preview failed. Please try again." }, requestId };
    }
  });
