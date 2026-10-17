/**
 * Spoken replies for the first-party voice agent, produced by the server TTS route
 * (/api/public/assistant/tts -> Inworld, using the provider/model/voice saved in the admin panel).
 *
 * This module deliberately has NO browser `speechSynthesis` fallback. If the server cannot produce
 * audio the caller is told why (a short, safe message) so the failure is visible instead of the
 * assistant silently switching to a different voice.
 */

export type ServerSpeechInfo = { provider: string; model: string };

export type ServerSpeakOptions = {
  onStart?: (info: ServerSpeechInfo) => void;
  onEnd: () => void;
  /** Receives a message that is safe to show to visitors. */
  onError: (message: string) => void;
  /** Language hint (BCP-47 or ISO), e.g. from speech recognition. Omit to auto-detect. */
  lang?: string;
};

export const SERVER_SPEECH_ENDPOINT = "/api/public/assistant/tts";
export const SERVER_SPEECH_SITE = "antheticplus";
const MAX_SPEECH_CHARS = 6000;

const MESSAGES = {
  unsupported: "Spoken replies aren't supported in this browser. The reply is shown below.",
  generic: "I couldn't play audio, but the reply is shown below.",
  rateLimited: "Voice is temporarily rate-limited. Please try again shortly.",
  unavailable: "Voice is unavailable right now. The reply is shown below.",
  empty: "The voice service returned no audio.",
  blocked: "Your browser blocked audio playback. Tap the microphone again to enable it.",
};

// Smallest valid WAV (no samples). Played once from a user gesture to unlock audio on iOS Safari.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let generation = 0;
let controller: AbortController | null = null;
let player: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

export function isServerSpeechSupported() {
  return typeof Audio !== "undefined" && typeof fetch === "function";
}

/** Call from a user gesture (e.g. the mic button) so later replies are allowed to play. */
export function primeServerSpeech() {
  if (!isServerSpeechSupported() || player) return;
  try {
    player = new Audio();
    player.src = SILENT_WAV;
    void player.play().catch(() => undefined);
  } catch {
    player = null;
  }
}

function releaseAudio() {
  if (player) {
    player.onended = null;
    player.onerror = null;
    try {
      player.pause();
      player.removeAttribute("src");
      player.load();
    } catch {
      /* element already torn down */
    }
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

/** Stops playback and cancels any in-flight synthesis request. Never calls the callbacks. */
export function stopServerSpeech() {
  generation += 1;
  controller?.abort();
  controller = null;
  releaseAudio();
}

async function messageFor(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: unknown } };
    const message = json?.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 200);
  } catch {
    /* not JSON */
  }
  if (res.status === 429) return MESSAGES.rateLimited;
  if (res.status === 503) return MESSAGES.unavailable;
  return MESSAGES.generic;
}

export function speakServer(text: string, opts: ServerSpeakOptions) {
  const clean = text.trim().slice(0, MAX_SPEECH_CHARS);
  if (!clean) {
    opts.onError(MESSAGES.generic);
    return;
  }
  if (!isServerSpeechSupported()) {
    opts.onError(MESSAGES.unsupported);
    return;
  }

  stopServerSpeech();
  const mine = ++generation;
  const ctrl = new AbortController();
  controller = ctrl;
  const current = () => mine === generation;

  void (async () => {
    try {
      const res = await fetch(SERVER_SPEECH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: SERVER_SPEECH_SITE,
          text: clean,
          ...(opts.lang ? { language: opts.lang.slice(0, 20) } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!current()) return;
      if (!res.ok) {
        const message = await messageFor(res);
        if (current()) opts.onError(message);
        return;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.toLowerCase().startsWith("audio/")) {
        opts.onError(MESSAGES.generic);
        return;
      }
      const blob = await res.blob();
      if (!current()) return;
      if (!blob.size) {
        opts.onError(MESSAGES.empty);
        return;
      }

      const info: ServerSpeechInfo = {
        provider: res.headers.get("x-ap-tts-provider") ?? "",
        model: res.headers.get("x-ap-tts-model") ?? "",
      };
      const audio = player ?? (player = new Audio());
      objectUrl = URL.createObjectURL(blob);
      audio.onended = () => {
        if (!current()) return;
        releaseAudio();
        opts.onEnd();
      };
      audio.onerror = () => {
        if (!current()) return;
        releaseAudio();
        opts.onError(MESSAGES.generic);
      };
      audio.src = objectUrl;
      await audio.play();
      if (current()) opts.onStart?.(info);
    } catch (e) {
      if (!current() || (e instanceof DOMException && e.name === "AbortError")) return;
      releaseAudio();
      opts.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? MESSAGES.blocked
          : MESSAGES.generic,
      );
    }
  })();
}
