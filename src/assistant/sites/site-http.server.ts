/** HTTP helpers for the public, embeddable Web Assistant endpoints. */
import { resolveSiteForOrigin, type SiteResolution } from "./site-context.server";
import { loadSiteConfig } from "./site-config.server";
import { isSiteId } from "./site-registry";
import { loadKeyStore, touchKey, verifyRawKey } from "@/lib/site-keys.server";
import type { SiteKeyScope } from "@/lib/site-keys";

export function cors(origin: string | null, allowed: boolean): Record<string, string> {
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (allowed && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Site-Key";
  }
  return h;
}

export function jsonResponse(
  data: unknown,
  status: number,
  origin: string | null,
  allowed: boolean,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin, allowed) },
  });
}

/** Origin header, falling back to the Referer's origin for same-origin GETs that omit Origin. */
export function requestOrigin(request: Request): string | null {
  const o = request.headers.get("origin");
  if (o) return o;
  const r = request.headers.get("referer");
  try {
    return r ? new URL(r).origin : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the site for a public request.
 * - `Authorization: Bearer ap_sk_...` (server-to-server / headless): a valid, unrevoked
 *   secret key with the scope authorizes the site without an Origin match.
 * - Otherwise the Origin must match the site's domains, and when the site requires
 *   embed keys, `X-Site-Key: ap_pk_...` must also be valid for the scope.
 */
export async function resolveFromRequest(
  request: Request,
  claimed: unknown,
  scope: SiteKeyScope = "chat",
): Promise<SiteResolution> {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (bearer.startsWith("ap_sk_")) {
    if (!isSiteId(claimed)) return { ok: false, code: "invalid_site", message: "Unknown site." };
    const chk = await verifyRawKey(claimed, bearer, scope);
    if (!chk.ok)
      return {
        ok: false,
        code: "origin_mismatch",
        message: `Installation key rejected (${chk.reason}).`,
      };
    const config = await loadSiteConfig(claimed);
    if (!config.enabled)
      return { ok: false, code: "disabled", message: "This assistant is turned off." };
    void touchKey(claimed, chk.key.id);
    return { ok: true, site: { id: claimed, config } };
  }
  const res = await resolveSiteForOrigin(
    claimed,
    requestOrigin(request),
    new URL(request.url).host,
  );
  if (!res.ok) return res;
  const store = await loadKeyStore(res.site.id);
  if (store.requireEmbedKey) {
    const chk = await verifyRawKey(res.site.id, request.headers.get("x-site-key"), scope);
    if (!chk.ok || chk.key.kind !== "publishable")
      return { ok: false, code: "origin_mismatch", message: "A valid site key is required." };
    void touchKey(res.site.id, chk.key.id);
  }
  return res;
}

export async function preflightFor(request: Request) {
  const site = new URL(request.url).searchParams.get("site");
  const origin = requestOrigin(request);
  // Preflight cannot carry a body, so the site comes from the query string; the real request re-validates.
  const res = await resolveFromRequest(request, site).catch(() => null);
  return new Response(null, { status: 204, headers: cors(origin, !!res?.ok) });
}
