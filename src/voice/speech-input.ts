/** Browser speech-to-text (Web Speech API). No business logic. */

export type SpeechInputError = "mic_denied" | "no_mic" | "no_speech" | "network" | "unsupported" | "failed";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechInputSupported() {
  return ctor() !== null;
}

/** Triggers the browser permission prompt so denial is reported clearly. */
export async function requestMicrophone(): Promise<SpeechInputError | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NotAllowedError" || name === "SecurityError") return "mic_denied";
    if (name === "NotFoundError") return "no_mic";
    return "failed";
  }
}

export type ListenHandle = { stop: () => void; abort: () => void };

export function listenOnce(opts: {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: SpeechInputError) => void;
  onEnd: () => void;
}): ListenHandle | null {
  const C = ctor();
  if (!C) {
    opts.onError("unsupported");
    return null;
  }
  const r = new C();
  r.continuous = false;
  r.interimResults = true;
  r.lang = opts.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
  let finalText = "";
  r.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (interim) opts.onInterim?.(interim);
  };
  r.onerror = (e: any) => {
    const code = String(e?.error ?? "");
    if (code === "aborted") return;
    opts.onError(
      code === "not-allowed" || code === "service-not-allowed"
        ? "mic_denied"
        : code === "audio-capture"
          ? "no_mic"
          : code === "no-speech"
            ? "no_speech"
            : code === "network"
              ? "network"
              : "failed",
    );
  };
  r.onend = () => {
    const text = finalText.trim();
    if (text) opts.onFinal(text);
    opts.onEnd();
  };
  try {
    r.start();
  } catch {
    opts.onError("failed");
    return null;
  }
  return { stop: () => r.stop(), abort: () => r.abort() };
}
