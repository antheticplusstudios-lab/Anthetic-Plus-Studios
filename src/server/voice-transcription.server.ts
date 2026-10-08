/** Server-only multilingual speech-to-text implementation for the website assistant. */
import { db3Admin } from "@/server/db/clients.server";
import { decryptSecret } from "@/server/security/envelope.server";

const MAX_BASE64 = 4_000_000;
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";
const VOICE_AGENT_LABEL = "Homepage Voice Agent";

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
  data: { audioBase64: string; mimeType?: string },
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
    "voice.webm",
  );

  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret.key}`,
    },
    body: form,
    signal: signal ?? AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  const language = typeof payload.language === "string" ? payload.language.toLowerCase() : null;

  try {
    await db3Admin.from("llm_requests").insert({
      key_id: secret.id,
      provider_key: "groq",
      model: GROQ_MODEL,
      status: response.ok && text ? "success" : "error",
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

  if (!response.ok || !text) {
    throw new Error("I couldn't understand the audio. Please try again.");
  }

  return {
    text,
    language,
  };
}
