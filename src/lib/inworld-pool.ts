/** Pure Inworld TTS helpers (request shape + error classification). */
import type { AttemptResult } from "./key-pool";
import { classifyStatus } from "./key-pool";

export const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";
export const INWORLD_DEFAULT_MODEL = "inworld-tts-1";
export const INWORLD_DEFAULT_VOICE = "Ashley";

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

export function inworldOutcome(status: number, body: string): AttemptResult<never> {
  const kind = classifyStatus(status);
  if (kind === "ok") return { ok: false, kind: "fatal", message: "unexpected" };
  return { ok: false, kind, message: `Inworld ${status}: ${body.slice(0, 200)}` };
}
