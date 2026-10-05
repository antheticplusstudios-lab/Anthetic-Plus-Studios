/** HTTP helpers for the public, embeddable Web Assistant endpoints. */
import { resolveSiteForOrigin, type SiteResolution } from "./site-context.server";

export function cors(origin: string | null, allowed: boolean): Record<string, string> {
  const h: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (allowed && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return h;
}

export function jsonResponse(data: unknown, status: number, origin: string | null, allowed: boolean) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(origin, allowed) } });
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

export async function resolveFromRequest(request: Request, claimed: unknown): Promise<SiteResolution> {
  return resolveSiteForOrigin(claimed, requestOrigin(request), new URL(request.url).host);
}

export async function preflightFor(request: Request) {
  const site = new URL(request.url).searchParams.get("site");
  const origin = requestOrigin(request);
  // Preflight cannot carry a body, so the site comes from the query string; the real request re-validates.
  const res = await resolveFromRequest(request, site).catch(() => null);
  return new Response(null, { status: 204, headers: cors(origin, !!res?.ok) });
}
