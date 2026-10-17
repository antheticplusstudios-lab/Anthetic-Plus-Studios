/** Pure Inworld TTS helpers (request shape, text chunking, error classification). */
import type { AttemptResult } from "./key-pool";
import { classifyStatus } from "./key-pool";

export const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";
export const INWORLD_DEFAULT_MODEL = "inworld-tts-1";
export const INWORLD_DEFAULT_VOICE = "Ashley";
/** Inworld rejects any single request longer than 2,000 characters. Stay safely under it. */
export const INWORLD_MAX_CHARS = 2000;
export const INWORLD_CHUNK_CHARS = 1900;

export function inworldRequest(text: string, voiceId: string, model: string, key: string) {
  return {
    url: INWORLD_TTS_URL,
    init: {
      method: "POST",
      headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voiceId: voiceId || INWORLD_DEFAULT_VOICE,
        modelId: model || INWORLD_DEFAULT_MODEL,
        audioConfig: { audioEncoding: "MP3" },
      }),
    },
  };
}

/** Seconds from a Retry-After header (numeric form only), clamped to 1s..10min. */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(600, Math.max(1, Math.ceil(seconds))) * 1000;
}

export function inworldOutcome(
  status: number,
  body: string,
  retryAfter?: string | null,
): AttemptResult<never> {
  const kind = classifyStatus(status);
  if (kind === "ok") return { ok: false, kind: "fatal", message: "unexpected" };
  const message = `Inworld ${status}: ${body.slice(0, 200)}`;
  const retryAfterMs = kind === "limit" ? parseRetryAfterMs(retryAfter) : undefined;
  return { ok: false, kind, message, ...(retryAfterMs ? { retryAfterMs } : {}) };
}

/**
 * Split speech text into pieces Inworld will accept, preferring sentence boundaries. MP3 frames
 * concatenate cleanly, so the audio of consecutive pieces can simply be joined.
 */
export function splitForInworld(text: string, max = INWORLD_CHUNK_CHARS): string[] {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!normalized) return [];
  if (normalized.length <= max) return [normalized];

  const sentences = normalized
    .match(/[^.!?।。！？\n]+(?:[.!?।。！？]+|\n|$)/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [normalized];

  const pieces: string[] = [];
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max / 2) cut = max;
      // never split a surrogate pair
      const code = rest.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  }

  const out: string[] = [];
  let bucket = "";
  for (const piece of pieces) {
    if (!bucket) bucket = piece;
    else if (bucket.length + 1 + piece.length <= max) bucket += ` ${piece}`;
    else {
      out.push(bucket);
      bucket = piece;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

export type InworldFailureCode =
  | "not_configured"
  | "keys_unreadable"
  | "keys_resting"
  | "rejected_credentials"
  | "rate_limited"
  | "bad_request"
  | "upstream_unavailable"
  | "empty_audio";

const PUBLIC: Record<InworldFailureCode, { status: number; message: string; clientCode: string }> =
  {
    not_configured: {
      status: 503,
      message: "Multilingual voice is not configured yet.",
      clientCode: "offline",
    },
    keys_unreadable: {
      status: 503,
      message: "Voice is temporarily unavailable.",
      clientCode: "voice_unavailable",
    },
    keys_resting: {
      status: 503,
      message: "Voice is temporarily unavailable. Please try again shortly.",
      clientCode: "voice_unavailable",
    },
    rejected_credentials: {
      status: 503,
      message: "Voice is temporarily unavailable.",
      clientCode: "voice_unavailable",
    },
    rate_limited: {
      status: 429,
      message: "Voice is temporarily rate-limited. Please try again shortly.",
      clientCode: "rate_limited",
    },
    bad_request: {
      status: 502,
      message: "The configured voice or model isn't available.",
      clientCode: "voice_config",
    },
    upstream_unavailable: {
      status: 502,
      message: "The voice service is not responding. Please try again shortly.",
      clientCode: "upstream",
    },
    empty_audio: {
      status: 502,
      message: "The voice service returned no audio.",
      clientCode: "upstream",
    },
  };

/**
 * A failed Inworld synthesis. `message` carries operator detail (logs and the admin TTS test);
 * `publicMessage` is the only text that may reach website visitors. Neither ever contains a key.
 */
export class InworldTtsError extends Error {
  readonly code: InworldFailureCode;
  readonly status: number;
  readonly clientCode: string;
  readonly publicMessage: string;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: InworldFailureCode, detail: string, retryAfterSeconds?: number) {
    super(detail);
    this.name = "InworldTtsError";
    this.code = code;
    const pub = PUBLIC[code];
    this.status = pub.status;
    this.clientCode = pub.clientCode;
    this.publicMessage = pub.message;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
