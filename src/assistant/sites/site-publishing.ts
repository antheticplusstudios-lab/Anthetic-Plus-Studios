/**
 * Client-safe, pure rules for the shared Website AI Agent publishing workflow.
 *
 * - The LIVE config (what visitors get) is only changed by publish or rollback.
 * - Admin edits go to a per-site DRAFT.
 * - Every publish stores an immutable version snapshot so it can be rolled back.
 * - Knowledge is approval-gated separately and is never part of a draft/version
 *   snapshot: the live agent always uses only currently approved knowledge.
 * - Non-first-party sites only accept traffic from domains an admin has verified.
 */
import { SITES, type SiteId } from "./site-registry";
import type { SiteConfig } from "./site-config.types";

/** Settings fields that are drafted and versioned (everything except knowledge/sources). */
export const SETTINGS_FIELDS = [
  "enabled",
  "voiceEnabled",
  "displayName",
  "persona",
  "tone",
  "welcomeMessage",
  "instructions",
  "businessInfo",
  "services",
  "products",
  "faqs",
  "terminology",
  "policies",
  "contact",
  "hours",
  "branding",
  "voice",
  "allowedTools",
  "emailEnabled",
  "limits",
  "extraDomains",
  "analyticsEnabled",
  "discovery",
] as const satisfies readonly (keyof SiteConfig)[];

export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export type SiteSettings = Pick<SiteConfig, SettingsField>;

export const CHANNEL_FIELDS: Record<"shared" | "chat" | "voice", SettingsField[]> = {
  shared: [
    "displayName",
    "persona",
    "tone",
    "instructions",
    "businessInfo",
    "services",
    "products",
    "faqs",
    "terminology",
    "policies",
    "contact",
    "hours",
    "allowedTools",
  ],
  chat: ["enabled", "welcomeMessage", "branding", "limits", "emailEnabled", "analyticsEnabled"],
  voice: ["voiceEnabled", "voice"],
};

export type SiteDraft = {
  settings: SiteSettings;
  updatedAt: string;
  updatedBy: string;
  /** Live version the draft was started from. */
  baseVersion: number;
};

export type PublishedVersion = {
  version: number;
  settings: SiteSettings;
  publishedAt: string;
  publishedBy: string;
  note: string;
  rolledBackFrom: number | null;
};

export type VersionHistory = { versions: PublishedVersion[]; lastError: string | null };

export type DomainRecord = {
  domain: string;
  token: string;
  requestedAt: string;
  verifiedAt: string | null;
  lastCheckAt: string | null;
  lastCheckError: string | null;
};
export type DomainStore = { domains: DomainRecord[] };

export type AgentState = "not_configured" | "draft" | "published" | "failed";

export const MAX_VERSIONS = 30;

export function pickSettings(c: SiteConfig | SiteSettings): SiteSettings {
  const out = {} as Record<string, unknown>;
  for (const f of SETTINGS_FIELDS) out[f] = structuredClone((c as SiteSettings)[f]);
  return out as SiteSettings;
}

export function changedFields(a: SiteSettings, b: SiteSettings): SettingsField[] {
  return SETTINGS_FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

export function currentVersion(h: VersionHistory): number {
  return h.versions.reduce((m, v) => Math.max(m, v.version), 0);
}

export function agentState(input: {
  liveSaved: boolean;
  draft: SiteDraft | null;
  live: SiteSettings;
  history: VersionHistory;
}): AgentState {
  if (input.history.lastError) return "failed";
  if (input.draft && changedFields(input.draft.settings, input.live).length > 0) return "draft";
  if (!input.liveSaved && currentVersion(input.history) === 0) return "not_configured";
  return "published";
}

export function verifiedDomains(store: DomainStore): string[] {
  return store.domains.filter((d) => d.verifiedAt).map((d) => d.domain);
}

/**
 * Domains that may serve the widget for this site. First-party sites keep their
 * configured list; partner sites only get domains that are both listed and verified.
 */
export function effectiveDomains(id: SiteId, extraDomains: string[], store: DomainStore): string[] {
  const listed = [...SITES[id].domains, ...extraDomains];
  if (SITES[id].firstParty) return listed;
  // Partner sites: only domains proven via DNS TXT or the verification file.
  return verifiedDomains(store);
}

/** Reasons a draft cannot be published. Empty means OK. */
export function publishBlockers(id: SiteId, s: SiteSettings, domains: DomainStore): string[] {
  const out: string[] = [];
  if (!s.displayName.trim()) out.push("Assistant name is empty");
  if (!s.welcomeMessage.trim()) out.push("Welcome message is empty");
  if (!SITES[id].firstParty && s.enabled) {
    if (effectiveDomains(id, s.extraDomains, domains).length === 0)
      out.push("Turning it on needs at least one verified website domain");
    if (!s.businessInfo.trim() || s.businessInfo.startsWith("Configure "))
      out.push("Turning it on needs verified business information");
    if (!s.contact.trim()) out.push("Turning it on needs contact details");
  }
  return out;
}

export function publish(
  history: VersionHistory,
  settings: SiteSettings,
  by: string,
  note: string,
  now: string,
  rolledBackFrom: number | null = null,
): { history: VersionHistory; version: PublishedVersion } {
  const version: PublishedVersion = {
    version: currentVersion(history) + 1,
    settings: pickSettings(settings),
    publishedAt: now,
    publishedBy: by,
    note: note.slice(0, 300),
    rolledBackFrom,
  };
  const versions = [version, ...history.versions].slice(0, MAX_VERSIONS);
  return { history: { versions, lastError: null }, version };
}

/** Rollback = publishing an old snapshot again as a new version (history is never rewritten). */
export function rollback(history: VersionHistory, target: number, by: string, now: string) {
  const v = history.versions.find((x) => x.version === target);
  if (!v) throw new Error(`Version ${target} not found`);
  return publish(history, v.settings, by, `Rollback to v${target}`, now, target);
}

export function normalizeHistory(raw: unknown): VersionHistory {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const versions = Array.isArray(v["versions"]) ? (v["versions"] as PublishedVersion[]) : [];
  return {
    versions: versions
      .filter((x) => x && typeof x.version === "number" && x.settings)
      .slice(0, MAX_VERSIONS),
    lastError: typeof v["lastError"] === "string" ? (v["lastError"] as string) : null,
  };
}

export function normalizeDomains(raw: unknown): DomainStore {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = Array.isArray(v["domains"]) ? (v["domains"] as DomainRecord[]) : [];
  return {
    domains: d
      .filter((x) => x && typeof x.domain === "string" && typeof x.token === "string")
      .slice(0, 10),
  };
}

export function normalizeDraft(raw: unknown): SiteDraft | null {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!v || !v["settings"] || typeof v["settings"] !== "object") return null;
  return v as unknown as SiteDraft;
}

/** Knowledge review: only an explicit approve changes status to approved. */
export type ReviewAction = "approve" | "reject" | "disable";
export function reviewStatus(action: ReviewAction): "approved" | "disabled" {
  return action === "approve" ? "approved" : "disabled";
}

export const VERIFY_TXT_PREFIX = "_antheticplus-verify";
export const VERIFY_FILE_PATH = "/.well-known/antheticplus-verify.txt";
