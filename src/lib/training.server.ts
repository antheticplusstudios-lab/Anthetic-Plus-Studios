/** Auto-training runner. Every run is recorded in DB3 training_jobs so progress persists. */
import { db2Admin, db3Admin } from "@/server/db/clients.server";
import { htmlToText, MAX_PAGES, normalizeSiteUrl, sameHostLinks } from "./training";

type Job = { id: string };

async function startJob(target: string, sourceUrl: string | null): Promise<Job> {
  const { data, error } = await db3Admin
    .from("training_jobs")
    .insert({
      target,
      source_url: sourceUrl,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create training job");
  return { id: String(data.id) };
}

async function patchJob(
  job: Job,
  patch: {
    status?: string;
    pages?: number;
    chunks?: number;
    error?: string | null;
    finished_at?: string;
  },
) {
  await db3Admin.from("training_jobs").update(patch).eq("id", job.id);
}

async function crawl(start: string, onPage: (n: number) => Promise<void>) {
  const { safeFetch, readLimitedText } = await import("./safe-fetch.server");
  const queue = [start];
  const seen = new Set<string>();
  const pages: { url: string; text: string }[] = [];
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const { response } = await safeFetch(url, {
        headers: { "user-agent": "AntheticPlusTrainer/1.0" },
      });
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("html")) continue;
      const html = await readLimitedText(response);
      const text = htmlToText(html);
      if (text.length > 120) pages.push({ url, text: text.slice(0, 15000) });
      if (pages.length === 1) queue.push(...sameHostLinks(html, url));
      await onPage(pages.length);
    } catch {
      /* skip unreachable page */
    }
  }
  return pages;
}

/** AI fallback when a site has too little readable text: summarize what we have into usable knowledge. */
async function aiFill(context: string, name: string): Promise<string | null> {
  try {
    const { complete } = await import("./ai-completion.server");
    const r = await complete(db3Admin, {
      system:
        "You write short, factual business knowledge for an AI assistant. Never invent prices, phone numbers or addresses.",
      user: `Business website: ${name}\nKnown text:\n${context.slice(0, 4000)}\n\nWrite a concise FAQ-style knowledge sheet from only this text.`,
      maxTokens: 900,
    });
    return r.text || null;
  } catch {
    return null;
  }
}

export async function trainAutomation(automationId: string) {
  const { data: a, error } = await db2Admin
    .from("client_automations")
    .select("id,client_id,domain_url")
    .eq("id", automationId)
    .maybeSingle();
  if (error || !a) throw new Error("Automation not found");
  const url = normalizeSiteUrl(String(a.domain_url ?? ""));
  const job = await startJob(`automation:${automationId}`, url);
  try {
    if (!url) throw new Error("This automation has no website set");
    const pages = await crawl(url, (n) => patchJob(job, { pages: n }));
    const { data: kb } = await db3Admin
      .from("knowledge_bases")
      .select("id")
      .eq("automation_id", automationId)
      .maybeSingle();
    if (!kb?.id) throw new Error("Knowledge base is not set up for this automation yet");
    let docs = pages.map((p) => ({ name: p.url, content: p.text }));
    const total = pages.reduce((n, p) => n + p.text.length, 0);
    if (total < 800) {
      const filled = await aiFill(pages.map((p) => p.text).join("\n"), url);
      if (filled) docs = [...docs, { name: "AI summary", content: filled }];
    }
    if (!docs.length) throw new Error("No readable pages found on the website");
    await db3Admin
      .from("kb_documents")
      .delete()
      .eq("automation_id", automationId)
      .eq("source_type", "auto_training");
    const { indexKnowledgeDocument } = await import("./rag.server");
    let chunks = 0;
    for (const d of docs) {
      const { data: doc } = await db3Admin
        .from("kb_documents")
        .insert({
          knowledge_base_id: kb.id,
          client_id: a.client_id,
          automation_id: automationId,
          source_type: "auto_training",
          source_name: d.name,
          content: d.content,
          status: "processing",
          metadata: { auto: true },
        })
        .select("id")
        .single();
      if (!doc) continue;
      const r = await indexKnowledgeDocument(String(doc.id)).catch(() => ({ embedded: 0 }));
      chunks += r.embedded;
      await db3Admin
        .from("kb_documents")
        .update({ status: r.embedded > 0 ? "completed" : "error" })
        .eq("id", doc.id);
    }
    await patchJob(job, {
      status: "done",
      pages: pages.length,
      chunks,
      finished_at: new Date().toISOString(),
    });
    return { ok: true, pages: pages.length, chunks };
  } catch (e) {
    await patchJob(job, {
      status: "failed",
      error: (e as Error).message,
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: (e as Error).message };
  }
}

export async function trainSite(siteId: "antheticplus" | "ny-partners") {
  const job = await startJob(`site:${siteId}`, null);
  try {
    const { loadSiteConfig, saveSiteConfig } = await import("@/assistant/sites/site-config.server");
    const { scanSource, syncKnowledgeSnapshot } =
      await import("@/assistant/sites/site-knowledge.server");
    let config = await loadSiteConfig(siteId);
    if (!config.sources.length) throw new Error("No website sources added for this assistant yet");
    let scanned = 0;
    for (const s of config.sources) {
      const r = await scanSource(siteId, config, s.id);
      config = r.config;
      if (!r.error) scanned += 1;
      await patchJob(job, { pages: scanned });
    }
    await saveSiteConfig(siteId, config);
    await syncKnowledgeSnapshot(siteId, config).catch(() => undefined);
    await patchJob(job, {
      status: scanned ? "done" : "failed",
      pages: scanned,
      chunks: config.knowledge.length,
      error: scanned ? null : "No source could be read",
      finished_at: new Date().toISOString(),
    });
    return { ok: scanned > 0, pages: scanned };
  } catch (e) {
    await patchJob(job, {
      status: "failed",
      error: (e as Error).message,
      finished_at: new Date().toISOString(),
    });
    return { ok: false, error: (e as Error).message };
  }
}

/** Scheduled run: both site assistants, then every active client automation. */
export async function trainEverything(limit = 20) {
  const results: Record<string, unknown> = {};
  for (const s of ["antheticplus", "ny-partners"] as const)
    results[`site:${s}`] = await trainSite(s);
  const { data } = await db2Admin
    .from("client_automations")
    .select("id")
    .eq("is_active", true)
    .limit(limit);
  for (const r of data ?? []) results[`automation:${r.id}`] = await trainAutomation(String(r.id));
  return results;
}
