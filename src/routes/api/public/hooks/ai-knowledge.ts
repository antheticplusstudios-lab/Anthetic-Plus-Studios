import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { SITE_IDS } from "@/assistant/sites/site-registry";
import { loadSiteConfig, saveSiteConfig } from "@/assistant/sites/site-config.server";
import { scanSource, sourceAllowed, syncKnowledgeSnapshot } from "@/assistant/sites/site-knowledge.server";
import { db3Admin } from "@/server/db/clients.server";
import { ensureActiveWebsiteAiVersion } from "@/assistant/versioning.server";

async function runKnowledgeRefresh(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;

  const started = Date.now();
  const results: Array<Record<string, unknown>> = [];
  const appUrl = (process.env["VITE_APP_URL"] ?? "").replace(/\/$/, "");

  for (const siteId of SITE_IDS) {
    let config = await loadSiteConfig(siteId);
    if (siteId === "antheticplus" && appUrl && config.sources.length === 0) {
      const source = {
        id: randomUUID(),
        url: appUrl,
        active: true,
        status: "never_scanned" as const,
        error: null,
        lastScanAt: null,
        lastSuccessAt: null,
        lastChangeAt: null,
        contentHash: null,
        itemCount: 0,
      };
      if (sourceAllowed(siteId, config, source.url)) {
        config = await saveSiteConfig(siteId, { ...config, sources: [source] });
      }
    }

    for (const source of config.sources.filter((s) => s.active)) {
      const dueAfter = config.discovery.refreshHours * 60 * 60 * 1000;
      const due = !source.lastScanAt || Date.now() - new Date(source.lastScanAt).getTime() >= dueAfter;
      if (!due) continue;
      try {
        const scanned = await scanSource(siteId, config, source.id);
        config = await saveSiteConfig(siteId, scanned.config);
        if (!scanned.error) await syncKnowledgeSnapshot(siteId, config);
        results.push({ siteId, sourceId: source.id, changed: scanned.changed, ok: !scanned.error });
      } catch (error) {
        results.push({ siteId, sourceId: source.id, changed: false, ok: false, error: String(error).slice(0, 300) });
      }
    }

    try {
      await syncKnowledgeSnapshot(siteId, config);
      await ensureActiveWebsiteAiVersion(siteId);
    } catch (error) {
      results.push({ siteId, sync: false, error: String(error).slice(0, 300) });
    }
  }

  try {
    await db3Admin.from("website_ai_learning_candidates").update({ status: "pending" }).eq("status", "reviewing");
  } catch (error) {
    console.error("learning candidate maintenance failed", error);
  }

  return Response.json({ ok: true, ranAt: new Date().toISOString(), durationMs: Date.now() - started, results });
}

export const Route = createFileRoute("/api/public/hooks/ai-knowledge")({
  server: {
    handlers: {
      GET: async ({ request }) => runKnowledgeRefresh(request),
      POST: async ({ request }) => runKnowledgeRefresh(request),
    },
  },
});
