/**
 * Admin RPCs for each registered website assistant. Every call re-checks admin RBAC
 * on the server and only ever reads/writes the one site named in the request.
 */
import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { SITE_IDS } from "@/assistant/sites/site-registry";
import {
  loadSiteConfig,
  loadSiteConfigWithStatus,
  saveSiteConfig,
} from "@/assistant/sites/site-config.server";
import {
  scanSource,
  sourceAllowed,
  syncKnowledgeSnapshot,
} from "@/assistant/sites/site-knowledge.server";
import { siteForStaffPreview } from "@/assistant/sites/site-context.server";
import { runAssistant } from "@/assistant/assistant.service.server";
import type { AssistantResponse } from "@/assistant/assistant.types";
import type { KnowledgeItem, SiteConfig } from "@/assistant/sites/site-config.types";

const siteSchema = z.enum(SITE_IDS);

function audit(
  ctx: { userId: string },
  siteId: string,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  return auditMutation(ctx, {
    action: `web_assistant.${action}`,
    targetType: "web_assistant_site",
    targetId: siteId,
    metadata: { siteId, ...metadata },
  }).catch((e) => console.error("web assistant audit failed", e));
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Returns an error message when submitted domains are not bare hostnames. */
export function validateDomains(v: unknown): string | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return "Domains must be a list.";
  for (const d of v) {
    if (typeof d !== "string" || !HOST_RE.test(d.trim().toLowerCase()))
      return `"${String(d)}" is not a valid domain. Use a bare hostname like example.com.`;
  }
  return null;
}

export const adminGetSiteConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { loadAgent } = await import("@/assistant/sites/site-publishing.server");
    const [{ config, status }, agent] = await Promise.all([
      loadSiteConfigWithStatus(data.siteId),
      loadAgent(data.siteId),
    ]);
    // The editor shows the working draft (or live settings when no draft exists).
    return {
      siteId: data.siteId,
      config: { ...config, ...agent.working } as SiteConfig,
      status,
      agentState: agent.state,
      draftChanged: agent.changed,
    };
  });

/** Saves settings fields. Knowledge and sources are managed by their own RPCs and preserved here. */
export const adminSaveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, config: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const domainErr = validateDomains(data.config["extraDomains"]);
    if (domainErr) throw new Error(domainErr);
    // Edits are saved as a DRAFT. Visitors keep the published settings until an admin publishes.
    const { saveDraft } = await import("@/assistant/sites/site-publishing.server");
    const current = await loadSiteConfig(data.siteId);
    const draft = await saveDraft(data.siteId, data.config as Partial<SiteConfig>, context.userId);
    await audit(context, data.siteId, "draft.saved", { fields: Object.keys(data.config) });
    return { ok: true, draft: true, config: { ...current, ...draft.settings } as SiteConfig };
  });

const knowledgeSchema = z.object({
  id: z.string().max(64).nullable(),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum([
    "business",
    "service",
    "product",
    "faq",
    "policy",
    "contact",
    "hours",
    "pricing",
    "other",
  ]),
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
      ? {
          ...existing,
          title: data.item.title,
          content: data.item.content,
          category: data.item.category,
          status: data.item.status,
          updatedAt: now,
        }
      : {
          id: randomUUID(),
          title: data.item.title,
          content: data.item.content,
          category: data.item.category,
          // New submissions always wait for an explicit review.
          status: "needs_review",
          kind: "manual",
          sourceId: null,
          updatedAt: now,
        };
    const knowledge = existing
      ? c.knowledge.map((k) => (k.id === item.id ? item : k))
      : [item, ...c.knowledge];
    const saved = await saveSiteConfig(data.siteId, { ...c, knowledge });
    await syncKnowledgeSnapshot(data.siteId, saved);
    await audit(context, data.siteId, existing ? "knowledge.updated" : "knowledge.created", {
      itemId: item.id,
      status: item.status,
    });
    return { ok: true, config: saved };
  });

export const adminDeleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, id: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!c.knowledge.some((k) => k.id === data.id))
      throw new Error("Knowledge item not found for this site.");
    const saved = await saveSiteConfig(data.siteId, {
      ...c,
      knowledge: c.knowledge.filter((k) => k.id !== data.id),
    });
    await syncKnowledgeSnapshot(data.siteId, saved);
    await audit(context, data.siteId, "knowledge.deleted", { itemId: data.id });
    return { ok: true, config: saved };
  });

export const adminAddSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ siteId: siteSchema, url: z.string().trim().url().max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!sourceAllowed(data.siteId, c, data.url))
      throw new Error("Sources must be on this site's own domains.");
    if (c.sources.some((s) => s.url === data.url)) throw new Error("That source is already added.");
    const source = {
      id: randomUUID(),
      url: data.url,
      active: true,
      status: "never_scanned" as const,
      error: null,
      lastScanAt: null,
      lastSuccessAt: null,
      lastChangeAt: null,
      contentHash: null,
      itemCount: 0,
    };
    const saved = await saveSiteConfig(data.siteId, { ...c, sources: [...c.sources, source] });
    await audit(context, data.siteId, "source.added", { url: data.url });
    return { ok: true, config: saved };
  });

export const adminUpdateSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        id: z.string().max(64),
        op: z.enum(["enable", "disable", "remove"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const c = await loadSiteConfig(data.siteId);
    if (!c.sources.some((s) => s.id === data.id))
      throw new Error("Source not found for this site.");
    const next: SiteConfig =
      data.op === "remove"
        ? {
            ...c,
            sources: c.sources.filter((s) => s.id !== data.id),
            knowledge: c.knowledge.filter((k) => k.sourceId !== data.id),
          }
        : {
            ...c,
            sources: c.sources.map((s) =>
              s.id === data.id ? { ...s, active: data.op === "enable" } : s,
            ),
          };
    const saved = await saveSiteConfig(data.siteId, next);
    await audit(
      context,
      data.siteId,
      ({ enable: "source.enabled", disable: "source.disabled", remove: "source.removed" } as const)[
        data.op
      ],
      { sourceId: data.id },
    );
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
    await syncKnowledgeSnapshot(data.siteId, saved);
    await audit(context, data.siteId, "source.scanned", {
      sourceId: data.id,
      changed: result.changed,
      ok: !result.error,
    });
    return { ok: !result.error, changed: result.changed, error: result.error, config: saved };
  });

/** Staff test console: runs the shared engine as a signed-out visitor of the chosen site. */
export const adminPreviewSiteAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
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
      return await runAssistant({
        auth: null,
        history: data.history,
        message: data.message,
        requestId,
        site: await siteForStaffPreview(data.siteId),
        ...(data.siteId === "antheticplus" ? { providerKeyLabel: "Homepage Voice Agent" } : {}),
      });
    } catch (e) {
      console.error(`[assistant preview ${requestId}]`, e);
      return {
        ok: false,
        error: { code: "internal", message: "The preview failed. Please try again." },
        requestId,
      };
    }
  });
