/** Server-backed multilingual TTS playback. Browser speechSynthesis is intentionally not used. */
import { localeForLanguage } from "./language";

type SpeakOptions = {
  siteId?: string;
  language?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

let activeAbort: AbortController | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

export function isSpeechOutputSupported() {
  return typeof window !== "undefined" && typeof window.Audio === "function" && typeof fetch === "function";
}

function cleanupAudio() {
  const audio = activeAudio;
  activeAudio = null;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = null;
}

async function streamWithMediaSource(response: Response, options: SpeakOptions) {
  if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported("audio/mpeg")) return false;
  const body = response.body;
  if (!body) return false;

  const mediaSource = new MediaSource();
  const audio = new Audio();
  const url = URL.createObjectURL(mediaSource);
  activeAudio = audio;
  activeUrl = url;
  audio.src = url;
  audio.autoplay = false;
  audio.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => resolve();
    const onError = () => reject(new Error("Audio stream could not be opened."));
    mediaSource.addEventListener("sourceopen", onOpen, { once: true });
    mediaSource.addEventListener("error", onError, { once: true });
  });

  let sourceBuffer: SourceBuffer;
  try {
    sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
  } catch {
    cleanupAudio();
    return false;
  }

  const reader = body.getReader();
  let queued = false;
  const chunks: Uint8Array[] = [];
  let started = false;
  let done = false;

  const appendNext = () => {
    if (queued || sourceBuffer.updating || chunks.length === 0) return;
    queued = true;
    const chunk = chunks.shift()!;
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch (error) {
      queued = false;
      throw error;
    }
  };

  const maybeStartPlayback = async () => {
    if (started || chunks.length > 2) return;
    try {
      await audio.play();
      started = true;
      options.onStart?.();
    } catch (error) {
      if (!started) throw error;
    }
  };

  sourceBuffer.addEventListener("updateend", () => {
    queued = false;
    try {
      appendNext();
    } catch (error) {
      options.onError?.(error);
    }
    void maybeStartPlayback().catch((error) => options.onError?.(error));
    if (done && !sourceBuffer.updating && chunks.length === 0 && mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }
  });

  audio.onended = () => options.onEnd?.();
  audio.onerror = () => options.onError?.(new Error("Audio playback failed."));

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      appendNext();
      if (!started && chunks.length >= 2) await maybeStartPlayback();
    }
    done = true;
    if (!sourceBuffer.updating && chunks.length === 0 && mediaSource.readyState === "open") mediaSource.endOfStream();
    if (!started) await maybeStartPlayback();
    return true;
  } finally {
    reader.releaseLock();
  }
}

async function playBuffered(response: Response, options: SpeakOptions) {
  const blob = await response.blob();
  if (!blob.size) throw new Error("TTS returned no audio.");
  const audio = new Audio();
  const url = URL.createObjectURL(blob);
  activeAudio = audio;
  activeUrl = url;
  audio.src = url;
  audio.preload = "auto";
  audio.onended = () => options.onEnd?.();
  audio.onerror = () => options.onError?.(new Error("Audio playback failed."));
  await audio.play();
  options.onStart?.();
}

export function speak(text: string, options: SpeakOptions = {}) {
  if (!isSpeechOutputSupported()) {
    options.onError?.(new Error("Audio playback is unsupported."));
    return;
  }

  stopSpeaking();
  const controller = new AbortController();
  activeAbort = controller;
  const siteId = options.siteId ?? "antheticplus";
  const language = options.language ? localeForLanguage(options.language) : undefined;

  void (async () => {
    try {
      const response = await fetch("/api/public/assistant/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: siteId, text: text.trim(), language }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");
        throw new Error(body || `TTS request failed (${response.status}).`);
      }

      const bufferedResponse = response.clone();
      const safeOptions: SpeakOptions = {
        ...options,
        onStart: () => { if (!controller.signal.aborted) options.onStart?.(); },
        onEnd: () => { if (!controller.signal.aborted) options.onEnd?.(); },
        onError: (error) => { if (!controller.signal.aborted) options.onError?.(error); },
      };
      const streamed = await streamWithMediaSource(response, safeOptions).catch(() => false);
      if (!streamed && !controller.signal.aborted) await playBuffered(bufferedResponse, safeOptions);
    } catch (error) {
      if (controller.signal.aborted) return;
      cleanupAudio();
      options.onError?.(error);
    } finally {
      if (activeAbort === controller) activeAbort = null;
    }
  })();
}

export function stopSpeaking() {
  activeAbort?.abort();
  activeAbort = null;
  cleanupAudio();
}
