/**
 * Site-scoped knowledge: search and automatic discovery. Every function takes
 * one site's config and never touches another site's data.
 */
import { createHash, randomUUID } from "node:crypto";
import { SITES, type SiteId } from "./site-registry";
import { db3Admin } from "@/server/db/clients.server";
import { hostOf } from "./site-context.server";
import type { KnowledgeItem, KnowledgeSource, SiteConfig } from "./site-config.types";

const STOP = new Set(
  "the a an and or of to in for on is are what how do does can i you we our your with at by from about this that it be".split(
    " ",
  ),
);

function terms(q: string) {
  return q
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Keyword search over approved items. Manual knowledge outranks discovered knowledge. */
export async function searchSiteKnowledge(
  siteId: SiteId,
  config: SiteConfig,
  query: string,
  limit = 5,
) {
  const qs = terms(query);
  if (!qs.length) return [];
  const local = config.knowledge
    .filter((k) => k.status === "approved")
    .map((k) => {
      const hay = `${k.title} ${k.content}`.toLowerCase();
      let score = 0;
      for (const t of qs) if (hay.includes(t)) score += k.title.toLowerCase().includes(t) ? 3 : 1;
      if (k.kind === "manual") score *= 1.5;
      return {
        title: k.title,
        category: k.category,
        authority: k.kind === "manual" ? 100 : 70,
        content: k.content.slice(0, 1500),
        score,
      };
    })
    .filter((x) => x.score > 0);

  let durable: Array<{
    title: string;
    category: string;
    authority: number;
    content: string;
    score: number;
  }> = [];
  try {
    const { data } = await db3Admin
      .from("website_ai_knowledge_documents")
      .select("title,content,authority,metadata")
      .eq("site_id", siteId)
      .eq("status", "approved")
      .order("authority", { ascending: false })
      .limit(200);
    durable = (data ?? [])
      .map((d) => {
        const hay = `${d.title ?? ""} ${d.content ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of qs)
          if (hay.includes(t))
            score += String(d.title ?? "")
              .toLowerCase()
              .includes(t)
              ? 3
              : 1;
        return {
          title: String(d.title ?? ""),
          category: String(
            d.metadata && typeof d.metadata === "object" && !Array.isArray(d.metadata)
              ? (d.metadata.category ?? "other")
              : "other",
          ),
          authority: Number(d.authority ?? 50),
          content: String(d.content ?? "").slice(0, 1500),
          score,
        };
      })
      .filter((x) => x.score > 0);
  } catch (e) {
    console.error("durable website knowledge search failed", e);
  }

  return [...local, ...durable]
    .sort((a, b) => b.authority - a.authority || b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
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
  const firstPartyHost =
    SITES[id].firstParty && process.env["VITE_APP_URL"]
      ? (() => {
          try {
            return hostOf(new URL(process.env["VITE_APP_URL"]!).hostname);
          } catch {
            return "";
          }
        })()
      : "";
  const domains = [
    ...SITES[id].domains,
    ...config.extraDomains,
    ...(firstPartyHost ? [firstPartyHost] : []),
  ];
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
      const clean = (s: string) =>
        s
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;|&rsquo;/g, "'")
          .replace(/\s+/g, " ")
          .trim();
      return rest.length
        ? { heading: clean(headRaw ?? ""), text: clean(rest.join(" ")) }
        : { heading: "", text: clean(headRaw ?? "") };
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

/** Mirrors the approved site knowledge into the durable DB3 AI knowledge ledger. */
export async function syncKnowledgeSnapshot(id: SiteId, config: SiteConfig) {
  const now = new Date().toISOString();
  const sourceById = new Map(config.sources.map((s) => [s.id, s]));
  const groups = new Map<
    string,
    { name: string; url: string | null; type: string; items: typeof config.knowledge }
  >();
  for (const item of config.knowledge.filter((k) => k.status === "approved")) {
    const src = item.sourceId ? sourceById.get(item.sourceId) : null;
    const key = item.kind === "manual" ? "manual" : `source:${item.sourceId ?? "unknown"}`;
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else
      groups.set(key, {
        name: item.kind === "manual" ? "Admin-approved manual knowledge" : (src?.url ?? key),
        url: src?.url ?? null,
        type: item.kind === "manual" ? "manual" : "website",
        items: [item],
      });
  }
  const currentSourceIds: string[] = [];
  for (const [, group] of groups) {
    const { data: source, error: sourceError } = await db3Admin
      .from("website_ai_knowledge_sources")
      .upsert(
        {
          site_id: id,
          source_type: group.type,
          source_name: group.name,
          canonical_url: group.url,
          status: "active",
          last_scanned_at: now,
          last_success_at: now,
          updated_at: now,
        },
        { onConflict: "site_id,source_name" },
      )
      .select("id")
      .single();
    if (sourceError) throw new Error(sourceError.message);
    currentSourceIds.push(String(source.id));
    const { data: latest } = await db3Admin
      .from("website_ai_knowledge_documents")
      .select("version")
      .eq("source_id", source.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = Number(latest?.version ?? 0) + 1;
    await db3Admin
      .from("website_ai_knowledge_documents")
      .update({ status: "superseded", updated_at: now })
      .eq("source_id", source.id)
      .eq("status", "approved");
    for (const item of group.items) {
      const hash = createHash("sha256").update(`${item.title}\n${item.content}`).digest("hex");
      const { error } = await db3Admin.from("website_ai_knowledge_documents").upsert(
        {
          source_id: source.id,
          site_id: id,
          title: item.title,
          content: item.content,
          content_hash: hash,
          version: nextVersion,
          status: "approved",
          authority: item.kind === "manual" ? 100 : 70,
          published_at: now,
          metadata: { category: item.category, kind: item.kind, sourceId: item.sourceId },
          updated_at: now,
        },
        { onConflict: "source_id,content_hash" },
      );
      if (error) throw new Error(error.message);
    }
  }

  // Any previously indexed source that no longer exists in the approved snapshot
  // must stop contributing answers. This prevents deleted admin knowledge from
  // remaining live in DB3 forever.
  const { data: oldDocs } = await db3Admin
    .from("website_ai_knowledge_documents")
    .select("id,source_id")
    .eq("site_id", id)
    .eq("status", "approved");
  const currentSet = new Set(currentSourceIds);
  for (const doc of oldDocs ?? []) {
    if (!currentSet.has(String(doc.source_id))) {
      await db3Admin
        .from("website_ai_knowledge_documents")
        .update({ status: "superseded", updated_at: now })
        .eq("id", doc.id);
    }
  }

  // Materialize high-value structured facts separately so future tools can prefer
  // exact values (pricing/policies) over free-form semantic snippets.
  const factRows = config.knowledge
    .filter((k) => k.status === "approved" && ["pricing", "policy", "hours"].includes(k.category))
    .map((k) => ({
      site_id: id,
      fact_key: `${k.category}.${k.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
      fact_value: { title: k.title, content: k.content },
      status: "approved",
      authority: k.kind === "manual" ? 100 : 70,
      metadata: { category: k.category, sourceId: k.sourceId },
      updated_at: now,
    }));
  try {
    const { data: existingFacts } = await db3Admin
      .from("website_ai_knowledge_facts")
      .select("id,fact_key")
      .eq("site_id", id)
      .eq("status", "approved");
    if (factRows.length) {
      const { error } = await db3Admin
        .from("website_ai_knowledge_facts")
        .upsert(factRows, { onConflict: "site_id,fact_key" });
      if (error) throw error;
    }
    const activeKeys = new Set(factRows.map((f) => f.fact_key));
    for (const fact of existingFacts ?? []) {
      if (!activeKeys.has(String(fact.fact_key))) {
        await db3Admin
          .from("website_ai_knowledge_facts")
          .update({ status: "superseded", updated_at: now })
          .eq("id", fact.id);
      }
    }
  } catch (e) {
    console.error("website AI fact sync failed", e);
  }
}

/**
 * Fetches one approved source, extracts structured sections, dedupes, and
 * replaces only that source's discovered items. Manual items are never
 * touched. Discovered pricing that differs from existing approved pricing is
 * flagged as needs_review instead of silently winning.
 */
export async function scanSource(
  id: SiteId,
  config: SiteConfig,
  sourceId: string,
): Promise<{ config: SiteConfig; changed: boolean; error: string | null }> {
  const src = config.sources.find((s) => s.id === sourceId);
  if (!src) return { config, changed: false, error: "Source not found." };
  const now = new Date().toISOString();
  const update = (patch: Partial<KnowledgeSource>, knowledge = config.knowledge): SiteConfig => ({
    ...config,
    knowledge,
    sources: config.sources.map((s) =>
      s.id === sourceId ? { ...s, ...patch, lastScanAt: now } : s,
    ),
  });
  if (!sourceAllowed(id, config, src.url)) {
    return {
      config: update({ status: "failed", error: "URL is not on this site's domains." }),
      changed: false,
      error: "URL is not on this site's domains.",
    };
  }
  let html: string;
  try {
    const res = await fetch(src.url, {
      headers: { "User-Agent": "AntheticPlus-KnowledgeBot/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
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
  const unique = sections
    .filter((s) => {
      const h = createHash("sha1").update(s.text.toLowerCase()).digest("hex");
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    })
    .slice(0, 40);
  const hash = createHash("sha256")
    .update(unique.map((s) => s.heading + s.text).join("\n"))
    .digest("hex");
  if (hash === src.contentHash) {
    return {
      config: update({ status: "ok", error: null, lastSuccessAt: now }),
      changed: false,
      error: null,
    };
  }
  const hasApprovedManualPricing = config.knowledge.some(
    (k) => k.kind === "manual" && k.category === "pricing" && k.status === "approved",
  );
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
    config: update(
      {
        status: "ok",
        error: null,
        lastSuccessAt: now,
        lastChangeAt: now,
        contentHash: hash,
        itemCount: items.length,
      },
      [...kept, ...items].slice(0, 400),
    ),
    changed: true,
    error: null,
  };
}
