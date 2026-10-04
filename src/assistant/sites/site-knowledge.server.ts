/**
 * Site-scoped knowledge: search and automatic discovery. Every function takes
 * one site's config and never touches another site's data.
 */
import { createHash, randomUUID } from "node:crypto";
import { SITES, type SiteId } from "./site-registry";
import { hostOf } from "./site-context.server";
import type { KnowledgeItem, KnowledgeSource, SiteConfig } from "./site-config.types";

const STOP = new Set("the a an and or of to in for on is are what how do does can i you we our your with at by from about this that it be".split(" "));

function terms(q: string) {
  return q.toLowerCase().split(/[^a-z0-9\u0980-\u09ff]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Keyword search over approved items. Manual knowledge outranks discovered knowledge. */
export function searchSiteKnowledge(config: SiteConfig, query: string, limit = 5) {
  const qs = terms(query);
  if (!qs.length) return [];
  return config.knowledge
    .filter((k) => k.status === "approved")
    .map((k) => {
      const hay = `${k.title} ${k.content}`.toLowerCase();
      let score = 0;
      for (const t of qs) if (hay.includes(t)) score += k.title.toLowerCase().includes(t) ? 3 : 1;
      if (k.kind === "manual") score *= 1.5;
      return { k, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ k }) => ({ title: k.title, category: k.category, authority: k.kind === "manual" ? "admin" : "website", content: k.content.slice(0, 1500) }));
}

/** A source URL is only allowed if it is on one of this site's own domains. */
export function sourceAllowed(id: SiteId, config: SiteConfig, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = hostOf(u.hostname);
  const domains = [...SITES[id].domains, ...config.extraDomains];
  return domains.some((d) => host === hostOf(d) || host.endsWith(`.${hostOf(d)}`));
}

function extractText(html: string) {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  // Split on headings so each section becomes one knowledge item.
  const parts = body.split(/<h[1-3][^>]*>/i);
  const sections = parts
    .map((p) => {
      const [headRaw, ...rest] = p.split(/<\/h[1-3]>/i);
      const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
      return rest.length ? { heading: clean(headRaw ?? ""), text: clean(rest.join(" ")) } : { heading: "", text: clean(headRaw ?? "") };
    })
    .filter((s) => s.text.length >= 60);
  return { title: title.replace(/\s+/g, " "), sections };
}

function classify(text: string): KnowledgeItem["category"] {
  const t = text.toLowerCase();
  if (/\b(price|pricing|cost|৳|\$|bdt|per month|package)\b/.test(t)) return "pricing";
  if (/\b(faq|frequently asked|question)\b/.test(t)) return "faq";
  if (/\b(privacy|terms|refund|policy)\b/.test(t)) return "policy";
  if (/\b(contact|email|phone|whatsapp|address)\b/.test(t)) return "contact";
  if (/\b(hours|open|monday|saturday|sunday)\b/.test(t)) return "hours";
  if (/\b(service|automation|receptionist|agent|chatbot|workflow)\b/.test(t)) return "service";
  if (/\b(about|mission|company|founded|team)\b/.test(t)) return "business";
  return "other";
}

/**
 * Fetches one approved source, extracts structured sections, dedupes, and
 * replaces only that source's discovered items. Manual items are never
 * touched. Discovered pricing that differs from existing approved pricing is
 * flagged as needs_review instead of silently winning.
 */
export async function scanSource(id: SiteId, config: SiteConfig, sourceId: string): Promise<{ config: SiteConfig; changed: boolean; error: string | null }> {
  const src = config.sources.find((s) => s.id === sourceId);
  if (!src) return { config, changed: false, error: "Source not found." };
  const now = new Date().toISOString();
  const update = (patch: Partial<KnowledgeSource>, knowledge = config.knowledge): SiteConfig => ({
    ...config,
    knowledge,
    sources: config.sources.map((s) => (s.id === sourceId ? { ...s, ...patch, lastScanAt: now } : s)),
  });
  if (!sourceAllowed(id, config, src.url)) {
    return { config: update({ status: "failed", error: "URL is not on this site's domains." }), changed: false, error: "URL is not on this site's domains." };
  }
  let html: string;
  try {
    const res = await fetch(src.url, { headers: { "User-Agent": "AntheticPlus-KnowledgeBot/1.0", Accept: "text/html" }, signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new Error("Not an HTML page");
    if (!sourceAllowed(id, config, res.url || src.url)) throw new Error("Redirected off-site");
    html = (await res.text()).slice(0, 1_500_000);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "Fetch failed";
    return { config: update({ status: "failed", error: msg }), changed: false, error: msg };
  }
  const { title, sections } = extractText(html);
  const seen = new Set<string>();
  const unique = sections.filter((s) => {
    const h = createHash("sha1").update(s.text.toLowerCase()).digest("hex");
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  }).slice(0, 40);
  const hash = createHash("sha256").update(unique.map((s) => s.heading + s.text).join("\n")).digest("hex");
  if (hash === src.contentHash) {
    return { config: update({ status: "ok", error: null, lastSuccessAt: now }), changed: false, error: null };
  }
  const hasApprovedManualPricing = config.knowledge.some((k) => k.kind === "manual" && k.category === "pricing" && k.status === "approved");
  const items: KnowledgeItem[] = unique.map((s) => {
    const category = classify(`${s.heading} ${s.text}`);
    return {
      id: randomUUID(),
      title: (s.heading || title || src.url).slice(0, 160),
      content: s.text.slice(0, 2500),
      kind: "discovered",
      category,
      status: category === "pricing" && hasApprovedManualPricing ? "needs_review" : "approved",
      sourceId,
      updatedAt: now,
    };
  });
  const kept = config.knowledge.filter((k) => k.sourceId !== sourceId);
  return {
    config: update({ status: "ok", error: null, lastSuccessAt: now, lastChangeAt: now, contentHash: hash, itemCount: items.length }, [...kept, ...items].slice(0, 400)),
    changed: true,
    error: null,
  };
}
