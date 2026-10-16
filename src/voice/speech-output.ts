/** Browser text-to-speech with multilingual language selection and chunked playback. */

export type SpeakOptions = {
  onStart?: () => void;
  onEnd: () => void;
  onError: () => void;
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceName?: string;
};

let cachedVoices: SpeechSynthesisVoice[] = [];
let playbackGeneration = 0;

export function isSpeechOutputSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechOutputSupported()) return Promise.resolve([]);

  const now = window.speechSynthesis.getVoices();
  if (now.length) {
    cachedVoices = now;
    return Promise.resolve(now);
  }

  return new Promise((resolve) => {
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      cachedVoices = window.speechSynthesis.getVoices();
      resolve(cachedVoices);
    };

    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

function normalizeLanguage(lang: string) {
  const value = lang.trim().replace("_", "-").toLowerCase();

  const aliases: Record<string, string> = {
    bn: "bn-BD",
    hi: "hi-IN",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    ar: "ar-SA",
  };

  return aliases[value] ?? lang;
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  name?: string,
): SpeechSynthesisVoice | null {
  if (name) {
    const exact = voices.find((v) => v.name === name);
    if (exact) return exact;
  }

  const normalized = normalizeLanguage(lang);
  const lower = normalized.toLowerCase();
  const base = (lower.split("-")[0] ?? "en").toLowerCase();

  const matches = voices.filter(
    (v) => v.lang.toLowerCase().startsWith(`${base}-`) || v.lang.toLowerCase() === base,
  );

  const exactLang = matches.filter((v) => v.lang.toLowerCase() === lower);

  const pool = exactLang.length ? exactLang : matches;

  return (
    pool.find((v) => /natural|neural|google|samantha|aria|jenny|siri/i.test(v.name)) ??
    pool.find((v) => v.localService) ??
    pool[0] ??
    null
  );
}

/**
 * Mobile speechSynthesis implementations can stop long utterances early.
 * Keep chunks short enough for Chrome/Android while preserving sentence boundaries.
 */
function chunkText(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?।！？]+[.!?।！？]+|[^.!?।！？]+$/g) ?? [normalized];

  const chunks: string[] = [];

  for (const sentence of sentences) {
    const value = sentence.trim();
    if (!value) continue;

    if (value.length <= maxLength) {
      chunks.push(value);
      continue;
    }

    const words = value.split(/\s+/);
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;

      if (next.length > maxLength && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current) chunks.push(current);
  }

  return chunks;
}

export function speak(text: string, opts: SpeakOptions) {
  if (!isSpeechOutputSupported() || !text.trim()) {
    opts.onError();
    return;
  }

  const synth = window.speechSynthesis;
  const generation = ++playbackGeneration;

  synth.cancel();

  const lang = normalizeLanguage(opts.lang || navigator.language || "en-US");
  const chunks = chunkText(text);

  if (!chunks.length) {
    opts.onError();
    return;
  }

  const run = (voices: SpeechSynthesisVoice[]) => {
    if (generation !== playbackGeneration) return;

    let index = 0;
    let started = false;
    let settled = false;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;

      if (success) opts.onEnd();
      else opts.onError();
    };

    const speakNext = () => {
      if (generation !== playbackGeneration) return;

      if (index >= chunks.length) {
        finish(true);
        return;
      }

      const u = new SpeechSynthesisUtterance(chunks[index]);
      u.lang = lang;

      const voice = pickVoice(voices, lang, opts.voiceName);
      if (voice) u.voice = voice;

      u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1.0));
      u.pitch = Math.min(2, Math.max(0, opts.pitch ?? 1));

      u.onstart = () => {
        if (!started) {
          started = true;
          opts.onStart?.();
        }
      };

      u.onend = () => {
        if (generation !== playbackGeneration) return;

        index += 1;

        // Give Android Chrome a tiny scheduling window between utterances.
        window.setTimeout(speakNext, 20);
      };

      u.onerror = (event) => {
        if (generation !== playbackGeneration) return;

        const error = (event as SpeechSynthesisErrorEvent).error;

        if (error === "interrupted" || error === "canceled") {
          return;
        }

        finish(false);
      };

      synth.speak(u);

      if (synth.paused) {
        synth.resume();
      }
    };

    speakNext();
  };

  if (cachedVoices.length) {
    run(cachedVoices);
  } else {
    void loadVoices().then(run);
  }
}

export function stopSpeaking() {
  playbackGeneration += 1;

  if (isSpeechOutputSupported()) {
    window.speechSynthesis.cancel();
  }
}
