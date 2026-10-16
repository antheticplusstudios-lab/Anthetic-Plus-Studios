/** Server-only multilingual TTS router. Secrets never reach the browser. */
import { createHash } from "node:crypto";
import { db1Admin, db3Admin } from "@/server/db/clients.server";
import { INWORLD_DEFAULT_MODEL, INWORLD_DEFAULT_VOICE } from "./inworld-pool";
import { languageMetadataFrom, type SupportedVoiceLanguage } from "@/voice/language";

export const VOICE_TTS_LABEL = "Homepage Voice Agent TTS";
const MAX_TEXT = 6000;
const CLIENT_WINDOW_MS = 60_000;
const CLIENT_MAX_REQUESTS = 12;
const SITE_MAX_REQUESTS = 120;
const DAILY_WINDOW_MS = 86_400_000;
const DAILY_MAX_REQUESTS_PER_CLIENT = 120;
const DAILY_MAX_REQUESTS_PER_SITE = 2_000;
const DAILY_MAX_CHARS_PER_CLIENT = 120_000;
const DAILY_MAX_CHARS_PER_SITE = 2_000_000;

export type TTSProviderRequest = {
  text: string;
  voiceId: string;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
};
export type TTSProvider = {
  key: string;
  stream: (input: TTSProviderRequest) => Promise<Response>;
};

type TtsConfig = {
  provider: TTSProvider;
  model: string;
  voiceId: string;
  key: string;
  keyId: string | null;
};

/** Inworld voice via the website assistant key pool (keys rotate automatically). */
const inworldProvider: TTSProvider = {
  key: "inworld",
  stream: async (input) => {
    const { inworldSpeak } = await import("./inworld-tts.server");
    const audio = await inworldSpeak({
      scope: "website_assistant",
      text: input.text,
      voiceId: input.voiceId,
      model: input.model,
    });
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  },
};

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function storedVoiceAgentSettings() {
  const row = await db1Admin
    .from("platform_settings")
    .select("value")
    .eq("key", "voice_agent")
    .maybeSingle();
  if (row.error) throw new Error(`voice tts settings: ${row.error.message}`);
  return rec(row.data?.value);
}

export async function getVoiceTtsConfig(): Promise<TtsConfig | null> {
  const settings = await storedVoiceAgentSettings();
  const { inworldKeyCount } = await import("./inworld-tts.server");
  if ((await inworldKeyCount("website_assistant")) === 0) return null;
  return {
    provider: inworldProvider,
    model: String(settings["ttsModel"] ?? INWORLD_DEFAULT_MODEL).trim() || INWORLD_DEFAULT_MODEL,
    voiceId:
      String(settings["ttsVoiceId"] ?? INWORLD_DEFAULT_VOICE).trim() || INWORLD_DEFAULT_VOICE,
    key: "pool",
    keyId: null,
  };
}

function speechClean(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`>#-]+\s?/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

export function speechCharacterCount(text: string) {
  return speechClean(text).length;
}

function clientFingerprint(args: { siteId: string; ip: string | null; origin: string | null }) {
  const raw = `${args.siteId}|${args.ip || "unknown"}|${args.origin || "unknown"}`;
  return createHash("sha256").update(raw).digest("hex");
}

export async function enforceWebsiteTtsRateLimit(args: {
  siteId: string;
  text: string;
  ip: string | null;
  origin: string | null;
}) {
  const now = Date.now();
  const minuteAgo = new Date(now - CLIENT_WINDOW_MS).toISOString();
  const dayAgo = new Date(now - DAILY_WINDOW_MS).toISOString();
  const fingerprint = clientFingerprint(args);
  const chars = speechCharacterCount(args.text);
  const base = db3Admin
    .from("llm_requests")
    .select("id,request_metadata", { count: "exact", head: false })
    .eq("provider_key", "inworld")
    .eq("request_metadata->>surface", "website_tts");

  const [clientMinute, siteMinute, clientDay, siteDay, clientDayCount, siteDayCount] =
    await Promise.all([
      base
        .eq("request_metadata->>client_hash", fingerprint)
        .gte("created_at", minuteAgo)
        .limit(CLIENT_MAX_REQUESTS + 1),
      db3Admin
        .from("llm_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_key", "inworld")
        .eq("request_metadata->>surface", "website_tts")
        .eq("request_metadata->>site_id", args.siteId)
        .gte("created_at", minuteAgo),
      base.eq("request_metadata->>client_hash", fingerprint).gte("created_at", dayAgo).limit(1000),
      db3Admin
        .from("llm_requests")
        .select("id,request_metadata", { count: "exact", head: false })
        .eq("provider_key", "inworld")
        .eq("request_metadata->>surface", "website_tts")
        .eq("request_metadata->>site_id", args.siteId)
        .gte("created_at", dayAgo)
        .limit(5000),
      db3Admin
        .from("llm_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_key", "inworld")
        .eq("request_metadata->>surface", "website_tts")
        .eq("request_metadata->>client_hash", fingerprint)
        .gte("created_at", dayAgo),
      db3Admin
        .from("llm_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider_key", "inworld")
        .eq("request_metadata->>surface", "website_tts")
        .eq("request_metadata->>site_id", args.siteId)
        .gte("created_at", dayAgo),
    ]);
  for (const result of [
    clientMinute,
    siteMinute,
    clientDay,
    siteDay,
    clientDayCount,
    siteDayCount,
  ]) {
    if (result.error) throw new Error(`TTS rate limit check failed: ${result.error.message}`);
  }

  const clientDayRows = (clientDay.data ?? []) as Array<{
    request_metadata?: Record<string, unknown> | null;
  }>;
  const siteDayRows = (siteDay.data ?? []) as Array<{
    request_metadata?: Record<string, unknown> | null;
  }>;
  const clientChars = clientDayRows.reduce(
    (sum, row) => sum + Number(row.request_metadata?.["char_count"] ?? 0),
    0,
  );
  const siteChars = siteDayRows.reduce(
    (sum, row) => sum + Number(row.request_metadata?.["char_count"] ?? 0),
    0,
  );
  if ((clientMinute.data?.length ?? 0) >= CLIENT_MAX_REQUESTS)
    return { allowed: false as const, retryAfter: 60, reason: "client_minute" };
  if ((siteMinute.count ?? 0) >= SITE_MAX_REQUESTS)
    return { allowed: false as const, retryAfter: 60, reason: "site_minute" };
  if ((clientDayCount.count ?? 0) >= DAILY_MAX_REQUESTS_PER_CLIENT)
    return { allowed: false as const, retryAfter: 3600, reason: "client_daily_requests" };
  if ((siteDayCount.count ?? 0) >= DAILY_MAX_REQUESTS_PER_SITE)
    return { allowed: false as const, retryAfter: 3600, reason: "site_daily_requests" };
  if (clientChars + chars > DAILY_MAX_CHARS_PER_CLIENT)
    return { allowed: false as const, retryAfter: 3600, reason: "client_daily_chars" };
  if (siteChars + chars > DAILY_MAX_CHARS_PER_SITE)
    return { allowed: false as const, retryAfter: 3600, reason: "site_daily_chars" };
  return { allowed: true as const, clientHash: fingerprint, chars };
}

export async function logWebsiteTtsRequest(args: {
  keyId: string | null;
  siteId: string;
  clientHash: string;
  chars: number;
  language: string;
  model: string;
  status: string;
  httpStatus?: number;
  latencyMs: number;
  error?: string | null;
}) {
  try {
    await db3Admin.from("llm_requests").insert({
      key_id: args.keyId,
      provider_key: "inworld",
      model: args.model,
      status: args.status,
      http_status: args.httpStatus ?? 200,
      latency_ms: args.latencyMs,
      tokens_in: 0,
      tokens_out: 0,
      error: args.error ?? null,
      request_metadata: {
        surface: "website_tts",
        site_id: args.siteId,
        client_hash: args.clientHash,
        char_count: args.chars,
        language: args.language,
      },
    });
  } catch (e) {
    console.error("website tts request log failed", e);
  }
}

export type TtsStream = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  language: SupportedVoiceLanguage;
  provider: string;
  model: string;
};

export async function streamWebsiteSpeech(args: {
  text: string;
  language?: string | null;
  signal?: AbortSignal;
}): Promise<TtsStream> {
  const clean = speechClean(args.text);
  if (!clean) throw new Error("Nothing to synthesize.");
  const config = await getVoiceTtsConfig();
  if (!config)
    throw new Error(
      "Multilingual TTS is not configured. Add Inworld keys for the website assistant in Automation API keys.",
    );
  const language = languageMetadataFrom(clean, args.language, args.language ? 0.9 : 0.7);
  const response = await config.provider.stream({
    text: clean,
    voiceId: config.voiceId,
    model: config.model,
    apiKey: config.key,
    ...(args.signal ? { signal: args.signal } : {}),
  });
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`Inworld voice failed (${response.status}): ${body.slice(0, 240)}`);
  }
  return {
    stream: response.body,
    contentType: response.headers.get("content-type") || "audio/mpeg",
    language,
    provider: config.provider.key,
    model: config.model,
  };
}

export async function testWebsiteTts(args: { text: string; signal?: AbortSignal }) {
  const result = await streamWebsiteSpeech(args);
  const reader = result.stream.getReader();
  let bytes = 0;
  try {
    while (bytes < 128_000) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return {
    ok: bytes > 0,
    bytes,
    language: result.language.language,
    provider: result.provider,
    model: result.model,
  };
}
