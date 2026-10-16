/**
 * Storage for drafts, published versions and domain verification. Uses the
 * existing DB1 `platform_settings` table (one row per site per concern), so no
 * schema migration is required:
 *   web_assistant_draft:<site>     draft settings
 *   web_assistant_versions:<site>  published snapshots (max 30)
 *   web_assistant_domains:<site>   domain verification records
 */
import { randomBytes } from "crypto";
import { db1Admin } from "@/server/db/clients.server";
import type { SiteId } from "./site-registry";
import { loadSiteConfigWithStatus, normalizeConfig, saveSiteConfig } from "./site-config.server";
import {
  VERIFY_FILE_PATH,
  VERIFY_TXT_PREFIX,
  agentState,
  changedFields,
  normalizeDomains,
  normalizeDraft,
  normalizeHistory,
  pickSettings,
  publish,
  publishBlockers,
  rollback,
  type DomainStore,
  type SiteDraft,
  type SiteSettings,
  type VersionHistory,
} from "./site-publishing";

const k = {
  draft: (id: SiteId) => `web_assistant_draft:${id}`,
  versions: (id: SiteId) => `web_assistant_versions:${id}`,
  domains: (id: SiteId) => `web_assistant_domains:${id}`,
};

async function read(key: string): Promise<unknown> {
  const { data, error } = await db1Admin
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`settings read: ${error.message}`);
  return data?.value ?? null;
}
async function write(key: string, value: unknown) {
  const { error } = await db1Admin
    .from("platform_settings")
    .upsert(
      { key, value: value as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`settings write: ${error.message}`);
}
async function remove(key: string) {
  const { error } = await db1Admin.from("platform_settings").delete().eq("key", key);
  if (error) throw new Error(`settings delete: ${error.message}`);
}

export const loadDomains = async (id: SiteId): Promise<DomainStore> =>
  normalizeDomains(await read(k.domains(id)));
const loadHistory = async (id: SiteId): Promise<VersionHistory> =>
  normalizeHistory(await read(k.versions(id)));
const loadDraft = async (id: SiteId): Promise<SiteDraft | null> =>
  normalizeDraft(await read(k.draft(id)));

export async function loadAgent(id: SiteId) {
  const [{ config, status }, draft, history, domains] = await Promise.all([
    loadSiteConfigWithStatus(id),
    loadDraft(id),
    loadHistory(id),
    loadDomains(id),
  ]);
  const live = pickSettings(config);
  const working = draft
    ? pickSettings(normalizeConfig(id, { ...config, ...draft.settings }))
    : live;
  return {
    state: agentState({ liveSaved: status.saved, draft, live, history }),
    live,
    draft: draft ? { ...draft, settings: working } : null,
    working,
    changed: draft ? changedFields(working, live) : [],
    blockers: publishBlockers(id, working, domains),
    history,
    domains,
    knowledge: config.knowledge,
    liveUpdatedAt: status.updatedAt,
  };
}

export async function saveDraft(id: SiteId, settings: Partial<SiteSettings>, by: string) {
  const { config } = await loadSiteConfigWithStatus(id);
  const existing = await loadDraft(id);
  const merged = pickSettings(
    normalizeConfig(id, { ...config, ...(existing?.settings ?? {}), ...settings }),
  );
  const history = await loadHistory(id);
  const draft: SiteDraft = {
    settings: merged,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
    baseVersion: existing?.baseVersion ?? history.versions[0]?.version ?? 0,
  };
  await write(k.draft(id), draft);
  return draft;
}

export const discardDraft = (id: SiteId) => remove(k.draft(id));

async function applyLive(id: SiteId, settings: SiteSettings) {
  const { config } = await loadSiteConfigWithStatus(id);
  // Knowledge and sources always come from the current live row, never the snapshot.
  await saveSiteConfig(id, {
    ...config,
    ...settings,
    knowledge: config.knowledge,
    sources: config.sources,
  });
}

export async function publishDraft(id: SiteId, by: string, note: string) {
  const agent = await loadAgent(id);
  if (!agent.draft) throw new Error("There is no draft to publish.");
  const history = agent.history;
  if (agent.blockers.length) {
    await write(k.versions(id), { ...history, lastError: agent.blockers.join("; ") });
    throw new Error(`Can't publish: ${agent.blockers.join("; ")}`);
  }
  const next = publish(history, agent.working, by, note, new Date().toISOString());
  await applyLive(id, agent.working);
  await write(k.versions(id), next.history);
  await remove(k.draft(id));
  return next.version;
}

export async function rollbackTo(id: SiteId, target: number, by: string) {
  const [history, domains] = await Promise.all([loadHistory(id), loadDomains(id)]);
  const next = rollback(history, target, by, new Date().toISOString());
  const blockers = publishBlockers(id, next.version.settings, domains);
  if (blockers.length) throw new Error(`Can't roll back: ${blockers.join("; ")}`);
  await applyLive(id, next.version.settings);
  await write(k.versions(id), next.history);
  return next.version;
}

export async function requestDomain(id: SiteId, domain: string) {
  const store = await loadDomains(id);
  const existing = store.domains.find((d) => d.domain === domain);
  if (existing) return existing;
  const rec = {
    domain,
    token: `ap-verify-${randomBytes(16).toString("hex")}`,
    requestedAt: new Date().toISOString(),
    verifiedAt: null,
    lastCheckAt: null,
    lastCheckError: null,
  };
  if (store.domains.length >= 10) throw new Error("Too many domains for this site.");
  await write(k.domains(id), { domains: [...store.domains, rec] });
  return rec;
}

export async function removeDomain(id: SiteId, domain: string) {
  const store = await loadDomains(id);
  await write(k.domains(id), { domains: store.domains.filter((d) => d.domain !== domain) });
}

/** Looks for the token in a DNS TXT record (via DNS-over-HTTPS) or a file on the site. */
export async function checkDomain(id: SiteId, domain: string) {
  const store = await loadDomains(id);
  const rec = store.domains.find((d) => d.domain === domain);
  if (!rec) throw new Error("Add the domain first.");
  let found = false;
  let error: string | null = null;
  try {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`${VERIFY_TXT_PREFIX}.${domain}`)}&type=TXT`,
      { headers: { accept: "application/dns-json" } },
    );
    const j = (await r.json()) as { Answer?: { data?: string }[] };
    found = (j.Answer ?? []).some((a) => (a.data ?? "").replace(/"/g, "").trim() === rec.token);
  } catch (e) {
    error = `DNS lookup failed: ${e instanceof Error ? e.message : "unknown"}`;
  }
  if (!found) {
    try {
      const r = await fetch(`https://${domain}${VERIFY_FILE_PATH}`, { redirect: "manual" });
      if (r.ok) found = (await r.text()).trim() === rec.token;
    } catch {
      /* file check optional */
    }
  }
  const now = new Date().toISOString();
  const updated = {
    ...rec,
    lastCheckAt: now,
    verifiedAt: found ? (rec.verifiedAt ?? now) : rec.verifiedAt,
    lastCheckError: found ? null : (error ?? "Verification record not found yet"),
  };
  await write(k.domains(id), {
    domains: store.domains.map((d) => (d.domain === domain ? updated : d)),
  });
  return updated;
}
