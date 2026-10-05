/**
 * Resolves and validates which website a request is for. The claimed site id
 * must match the request origin's registered domains; mismatches are rejected.
 * The result only selects context — authorization is always checked separately.
 */
import { SITES, isSiteId, type SiteId } from "./site-registry";
import { loadSiteConfig } from "./site-config.server";
import type { SiteConfig } from "./site-config.types";

export type ResolvedSite = { id: SiteId; config: SiteConfig };

export function hostOf(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  try {
    return new URL(s.includes("://") ? s : `https://${s}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matches(host: string, domain: string) {
  const root = hostOf(domain);
  return !!host && !!root && (host === root || host.endsWith(`.${root}`));
}

export type SiteResolution = { ok: true; site: ResolvedSite } | { ok: false; code: "invalid_site" | "origin_mismatch" | "disabled"; message: string };

/**
 * @param claimed site id from the embed (untrusted)
 * @param origin  request Origin header (untrusted, used only for matching)
 * @param appHost host of this application (first-party)
 */
export async function resolveSiteForOrigin(claimed: unknown, origin: string | null, appHost: string): Promise<SiteResolution> {
  if (!isSiteId(claimed)) return { ok: false, code: "invalid_site", message: "Unknown site." };
  const def = SITES[claimed];
  const config = await loadSiteConfig(claimed);
  const host = hostOf(origin);
  const app = hostOf(appHost);
  const firstPartyOrigin = !!host && host === app;
  const allowed =
    (def.firstParty && firstPartyOrigin) ||
    [...def.domains, ...config.extraDomains].some((d) => matches(host, d));
  if (!allowed) return { ok: false, code: "origin_mismatch", message: "This assistant isn't available on this website." };
  return { ok: true, site: { id: claimed, config } };
}

/** First-party app pages always serve the AntheticPlus context; the browser cannot choose another. */
export async function firstPartySite(): Promise<ResolvedSite> {
  return { id: "antheticplus", config: await loadSiteConfig("antheticplus") };
}

/** Staff-only preview of any site, used by the admin test console after RBAC has been checked. */
export async function siteForStaffPreview(id: SiteId): Promise<ResolvedSite> {
  return { id, config: await loadSiteConfig(id) };
}
