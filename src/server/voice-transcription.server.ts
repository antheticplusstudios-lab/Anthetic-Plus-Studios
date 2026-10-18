/** Server-only multilingual speech-to-text implementation for the website assistant. */
import { db1Admin, db3Admin } from "@/server/db/clients.server";
import { normalizeMultilingualVoiceConfig } from "@/voice/multilingual-voice-config";
import { decryptSecret } from "@/server/security/envelope.server";
import { audioFileName, cleanTranscript, type WhisperSegment } from "@/voice/transcript-filter";

const MAX_BASE64 = 4_000_000;
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const VOICE_AGENT_LABEL = "Homepage Voice Agent";

type CachedVoiceConfig = {
  expiresAt: number;
  config: ReturnType<typeof normalizeMultilingualVoiceConfig>;
};
let cachedVoiceConfig: CachedVoiceConfig | null = null;

async function loadVoiceConfigForTranscription() {
  if (cachedVoiceConfig && cachedVoiceConfig.expiresAt > Date.now()) {
    return cachedVoiceConfig.config;
  }
  try {
    const { data: stored } = await db1Admin
      .from("platform_settings")
      .select("value")
      .eq("key", "voice_agent")
      .maybeSingle();
    const value =
      stored?.value && typeof stored.value === "object"
        ? (stored.value as Record<string, unknown>)["multilingualVoiceConfig"]
        : null;
    const config = normalizeMultilingualVoiceConfig(value);
    cachedVoiceConfig = { config, expiresAt: Date.now() + 30_000 };
    return config;
  } catch {
    // Fail open to safe defaults; the optional settings lookup must not block transcription.
    return normalizeMultilingualVoiceConfig(null);
  }
}

const parseDataUrl = (value: string) => {
  const match = /^data:([^;,]+)?(?:;[^,]+)?,([A-Za-z0-9+/=]+)$/.exec(value);

  if (!match) {
    throw new Error("Invalid voice audio payload.");
  }

  const mimeType = match[1] || "audio/webm";
  const encoded = match[2];
  if (!encoded) throw new Error("Invalid voice audio payload.");
  const bytes = Buffer.from(encoded, "base64");

  if (!bytes.length || bytes.length > 3_000_000) {
    throw new Error("Voice audio is too large.");
  }

  return { mimeType, bytes };
};

const getDedicatedGroqKey = async () => {
  const { data, error } = await db3Admin
    .from("llm_api_keys")
    .select("id,key_ciphertext")
    .eq("label", VOICE_AGENT_LABEL)
    .eq("provider_key", "groq")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.key_ciphertext) {
    return null;
  }

  try {
    return {
      id: String(data.id),
      key: decryptSecret(String(data.key_ciphertext)),
    };
  } catch {
    return null;
  }
};

export async function transcribeVoiceAudioData(
  data: { audioBase64: string; mimeType?: string; languageHint?: string | undefined },
  signal?: AbortSignal,
) {
  const started = Date.now();

  if (data.audioBase64.length > MAX_BASE64) {
    throw new Error("Voice audio is too large.");
  }

  const secret = await getDedicatedGroqKey();

  if (!secret) {
    throw new Error("Voice transcription is not configured.");
  }

  const parsed = parseDataUrl(data.audioBase64);

  const form = new FormData();

  const audioBytes = new Uint8Array(parsed.bytes.byteLength);
  audioBytes.set(parsed.bytes);
  form.append(
    "file",
    new Blob([audioBytes.buffer], { type: data.mimeType || parsed.mimeType }),
    audioFileName(data.mimeType || parsed.mimeType),
  );

  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Use admin-managed domain vocabulary without forcing one language: a previous turn's
  // language can bias Whisper away from the user's current language or code-switch.
  const voiceConfig = await loadVoiceConfigForTranscription();
  const vocabulary = [
    "AntheticPlus Studios",
    "AI receptionist",
    "automation",
    "booking",
    "appointment",
    ...(voiceConfig?.vocabulary ?? []),
  ]
    .map((term) =>
      term
        .replace(/[\r\n]/g, " ")
        .trim()
        .slice(0, 80),
    )
    .filter(Boolean)
    .slice(0, 30)
    .join(", ");
  const languageGuidance =
    voiceConfig?.allowCodeSwitching === false
      ? "Recognize the primary language spoken in this utterance."
      : "Preserve natural code-switching and product names across languages.";
  form.append("prompt", `${languageGuidance} Vocabulary: ${vocabulary}`.slice(0, 900));

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret.key}`,
    },
    body: form,
    signal: signal ?? AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  const rawText = typeof payload["text"] === "string" ? payload["text"].trim() : "";
  const segments = Array.isArray(payload["segments"])
    ? (payload["segments"] as WhisperSegment[])
    : null;
  const text = cleanTranscript(rawText, segments);

  const language =
    typeof payload["language"] === "string" ? payload["language"].toLowerCase() : null;

  try {
    await db3Admin.from("llm_requests").insert({
      key_id: secret.id,
      provider_key: "groq",
      model: GROQ_MODEL,
      status: response.ok ? (text ? "success" : "empty") : "error",
      http_status: response.status,
      latency_ms: Date.now() - started,
      tokens_in: 0,
      tokens_out: 0,
      error: response.ok ? null : JSON.stringify(payload).slice(0, 500),
      request_metadata: {
        requestType: "voice_transcription",
        language,
      },
    });
  } catch (e) {
    console.error("voice transcription log failed", e);
  }

  if (!response.ok) {
    throw new Error("I couldn't understand the audio. Please try again.");
  }
  // Empty text is a normal outcome (noise, a cough, filtered hallucination): the client keeps
  // listening instead of ending the conversation with an error.

  return {
    text,
    language,
  };
}
