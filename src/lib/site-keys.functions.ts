/** Admin RPCs for website installation keys. Admin RBAC is re-checked on every call. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/rbac.server";
import { auditMutation } from "@/lib/platform-access.server";
import { SITE_IDS, SITES } from "@/assistant/sites/site-registry";
import { SITE_KEY_SCOPES, toView } from "./site-keys";

const siteSchema = z.enum(SITE_IDS);

function audit(
  ctx: { userId: string },
  siteId: string,
  action: string,
  meta: Record<string, unknown>,
) {
  return auditMutation(ctx, {
    action: `website_key.${action}`,
    targetType: "website_agent_keys",
    targetId: siteId,
    metadata: { siteId, ...meta },
  }).catch((e) => console.error("site key audit failed", e));
}

export const adminListSiteKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { loadKeyStore } = await import("./site-keys.server");
    const { loadSiteConfig } = await import("@/assistant/sites/site-config.server");
    const [store, config] = await Promise.all([
      loadKeyStore(data.siteId),
      loadSiteConfig(data.siteId),
    ]);
    return {
      siteId: data.siteId,
      requireEmbedKey: store.requireEmbedKey,
      keys: store.keys.map(toView),
      domains: [...SITES[data.siteId].domains, ...config.extraDomains],
      enabled: config.enabled,
    };
  });

export const adminCreateSiteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        label: z.string().trim().min(1).max(80),
        kind: z.enum(["publishable", "secret"]),
        scopes: z.array(z.enum(SITE_KEY_SCOPES)).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { createKey } = await import("./site-keys.server");
    const { record, secret } = await createKey(data.siteId, data, context.userId);
    await audit(context, data.siteId, "created", {
      keyId: record.id,
      kind: record.kind,
      scopes: record.scopes,
    });
    // The raw secret is returned exactly once and never stored.
    return { key: toView(record), secret };
  });

export const adminRotateSiteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, keyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { rotateKey } = await import("./site-keys.server");
    const { record, secret } = await rotateKey(data.siteId, data.keyId);
    await audit(context, data.siteId, "rotated", { keyId: record.id, version: record.version });
    return { key: toView(record), secret };
  });

export const adminRevokeSiteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        keyId: z.string().uuid(),
        reason: z.string().trim().min(3).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { revokeKey } = await import("./site-keys.server");
    const k = await revokeKey(data.siteId, data.keyId, data.reason);
    await audit(context, data.siteId, "revoked", { keyId: k.id, reason: data.reason });
    return { key: toView(k) };
  });

export const adminSetRequireEmbedKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ siteId: siteSchema, required: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { loadKeyStore, saveKeyStore } = await import("./site-keys.server");
    const store = await loadKeyStore(data.siteId);
    if (data.required && !store.keys.some((k) => k.kind === "publishable" && !k.revokedAt))
      throw new Error("Create an active publishable key before requiring one.");
    store.requireEmbedKey = data.required;
    await saveKeyStore(data.siteId, store);
    await audit(context, data.siteId, "require_embed_key", { required: data.required });
    return { ok: true };
  });

/**
 * Connection test: verifies a pasted key against the stored hash for the site and scope,
 * and reports site readiness. Does not call the AI model or spend credits.
 */
export const adminTestSiteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        siteId: siteSchema,
        key: z.string().trim().min(8).max(120),
        scope: z.enum(SITE_KEY_SCOPES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const { verifyRawKey } = await import("./site-keys.server");
    const { loadSiteConfig } = await import("@/assistant/sites/site-config.server");
    const [chk, config] = await Promise.all([
      verifyRawKey(data.siteId, data.key, data.scope),
      loadSiteConfig(data.siteId),
    ]);
    const domains = [...SITES[data.siteId].domains, ...config.extraDomains];
    const checks = [
      {
        name: "Key is valid for this site",
        ok: chk.ok,
        detail: chk.ok ? `Key ${chk.key.prefix}…` : `Rejected: ${chk.reason}`,
      },
      {
        name: "Assistant is turned on",
        ok: config.enabled,
        detail: config.enabled ? "On" : "Turn it on in the assistant settings",
      },
      {
        name: "Allowed domain registered (for widget)",
        ok: SITES[data.siteId].firstParty || domains.length > 0,
        detail: domains.join(", ") || "No domain yet — the widget can't load until one is added",
      },
      {
        name: "Voice enabled",
        ok: data.scope !== "voice" || config.voiceEnabled,
        detail: config.voiceEnabled ? "On" : "Voice is off for this site",
      },
    ];
    return { ok: checks.every((c) => c.ok), checks };
  });
