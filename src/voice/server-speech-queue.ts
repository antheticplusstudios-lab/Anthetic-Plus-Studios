/**
 * Sentence-aware first-party TTS queue.
 *
 * The first short chunk is synthesized and played while the next chunk is fetched.
 * Cancelling a turn aborts every outstanding request and stops the active player.
 * This improves time-to-first-audio for long replies; the assistant's LLM response
 * itself is still currently returned as a complete response by the server function.
 */
import type { ServerSpeakOptions, ServerSpeechInfo } from "./server-speech";
import { SERVER_SPEECH_ENDPOINT, SERVER_SPEECH_SITE } from "./server-speech";

const MAX_CHARS = 6000;
const CHUNK_TARGET = 320;
const MAX_CHUNKS = 8;
const GENERIC_ERROR = "I couldn't play audio, but the reply is shown below.";
const EMPTY_ERROR = "The voice service returned no audio.";

type AudioChunk = { blob: Blob; info: ServerSpeechInfo };

let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let controllers = new Set<AbortController>();

export function splitSpeechIntoChunks(text: string): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
  if (!clean) return [];

  const sentences = clean.match(/[^.!?。！？\n]+[.!?。！？]?/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (current && current.length + sentence.length + 1 > CHUNK_TARGET) {
      chunks.push(current);
      current = "";
    }
    if (sentence.length > CHUNK_TARGET) {
      if (current) chunks.push(current);
      current = "";
      for (let i = 0; i < sentence.length; i += CHUNK_TARGET) {
        chunks.push(sentence.slice(i, i + CHUNK_TARGET).trim());
      }
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, MAX_CHUNKS);
}

function cleanupAudio() {
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.onplaying = null;
    try {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      // The browser may already have released the media element.
    }
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export function stopServerSpeechChunks() {
  generation++;
  for (const ctrl of controllers) ctrl.abort();
  controllers.clear();
  cleanupAudio();
}

async function fetchChunk(text: string, lang: string | undefined, mine: number): Promise<AudioChunk> {
  const ctrl = new AbortController();
  controllers.add(ctrl);
  try {
    const res = await fetch(SERVER_SPEECH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: SERVER_SPEECH_SITE,
        text,
        ...(lang ? { language: lang.slice(0, 20) } : {}),
      }),
      signal: ctrl.signal,
    });
    if (mine !== generation) throw new DOMException("Cancelled", "AbortError");
    if (!res.ok) {
      if (res.status === 429) throw new Error("Voice is temporarily rate-limited. Please try again shortly.");
      if (res.status === 503) throw new Error("Voice is unavailable right now. The reply is shown below.");
      throw new Error(GENERIC_ERROR);
    }
    if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/"))
      throw new Error(GENERIC_ERROR);
    const blob = await res.blob();
    if (!blob.size) throw new Error(EMPTY_ERROR);
    return {
      blob,
      info: {
        provider: res.headers.get("x-ap-tts-provider") ?? "",
        model: res.headers.get("x-ap-tts-model") ?? "",
      },
    };
  } finally {
    controllers.delete(ctrl);
  }
}

/**
 * Plays short sentence groups with one-chunk lookahead. Call stopServerSpeechChunks
 * on barge-in/unmount so no old audio or queued network request survives the turn.
 */
export function speakServerChunks(text: string, opts: ServerSpeakOptions) {
  const chunks = splitSpeechIntoChunks(text);
  if (!chunks.length) {
    opts.onError(GENERIC_ERROR);
    return;
  }
  stopServerSpeechChunks();
  const mine = ++generation;
  let index = 0;
  let started = false;
  let failed = false;
  const pending = new Map<number, Promise<AudioChunk>>();
  const current = () => mine === generation;

  const prepare = (i: number) => {
    if (i >= chunks.length || pending.has(i)) return;
    pending.set(i, fetchChunk(chunks[i]!, opts.lang, mine));
  };
  const playNext = async () => {
    if (!current() || failed) return;
    if (index >= chunks.length) {
      cleanupAudio();
      opts.onEnd();
      return;
    }
    prepare(index);
    prepare(index + 1); // overlap synthesis of the next chunk with current playback
    let chunk: AudioChunk;
    try {
      chunk = await pending.get(index)!;
    } catch (e) {
      if (!current() || (e instanceof DOMException && e.name === "AbortError")) return;
      failed = true;
      stopServerSpeechChunks();
      opts.onError(e instanceof Error ? e.message.slice(0, 200) : GENERIC_ERROR);
      return;
    }
    if (!current()) return;
    pending.delete(index);
    const audio = new Audio();
    activeAudio = audio;
    activeUrl = URL.createObjectURL(chunk.blob);
    audio.preload = "auto";
    audio.src = activeUrl;
    audio.onplaying = () => {
      if (!current()) return;
      if (!started) {
        started = true;
        opts.onStart?.(chunk.info);
      }
    };
    audio.onended = () => {
      if (!current()) return;
      cleanupAudio();
      index++;
      void playNext();
    };
    audio.onerror = () => {
      if (!current()) return;
      failed = true;
      stopServerSpeechChunks();
      opts.onError(GENERIC_ERROR);
    };
    try {
      await audio.play();
      if (current() && !started) {
        started = true;
        opts.onStart?.(chunk.info);
      }
    } catch (e) {
      if (!current()) return;
      failed = true;
      stopServerSpeechChunks();
      opts.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Your browser blocked audio playback. Tap the microphone again to enable it."
          : GENERIC_ERROR,
      );
    }
  };
  void playNext();
}
