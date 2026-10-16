import { db3Admin } from "@/server/db/clients.server";
import type { SiteId } from "./sites/site-registry";
import { loadAssistantSettings } from "./assistant.settings.server";
import { loadSiteConfig } from "./sites/site-config.server";

/** Records the effective Website AI configuration without ever changing model weights. */
export async function ensureActiveWebsiteAiVersion(siteId: SiteId) {
  const [settings, config] = await Promise.all([loadAssistantSettings(), loadSiteConfig(siteId)]);
  const model = "openai/gpt-oss-120b";
  const knowledgeVersion = Math.max(1, config.knowledge.length);
  const { data: latest } = await db3Admin
    .from("website_ai_versions")
    .select("version,model,knowledge_version,status")
    .eq("site_id", siteId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const same =
    latest &&
    latest.model === model &&
    Number(latest.knowledge_version) === knowledgeVersion &&
    latest.status === "active";
  if (same) return latest;
  const nextVersion = Number(latest?.version ?? 0) + 1;
  await db3Admin
    .from("website_ai_versions")
    .update({ status: "retired" })
    .eq("site_id", siteId)
    .eq("status", "active");
  const { data, error } = await db3Admin
    .from("website_ai_versions")
    .insert({
      site_id: siteId,
      version: nextVersion,
      model,
      prompt_version: "website-ai-gen2",
      knowledge_version: knowledgeVersion,
      tool_version: "website-tools-v1",
      voice_config: {
        enabled: settings.voiceEnabled,
        stt: "whisper-large-v3-turbo",
        tts: "browser-language-aware-fallback",
        bargeIn: true,
      },
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
