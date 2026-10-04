/** Browser text-to-speech (speechSynthesis). No business logic. */

export function isSpeechOutputSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(base!.toLowerCase()));
  const preferred = matches.find((v) => /natural|neural|google|samantha|aria|jenny/i.test(v.name));
  return preferred ?? matches[0] ?? null;
}

export function speak(text: string, opts: { onStart?: () => void; onEnd: () => void; onError: () => void }) {
  if (!isSpeechOutputSupported()) {
    opts.onError();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const lang = navigator.language || "en-US";
  u.lang = lang;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = 1.02;
  let settled = false;
  const done = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };
  u.onstart = () => opts.onStart?.();
  u.onend = () => done(opts.onEnd);
  u.onerror = (e) => done((e as SpeechSynthesisErrorEvent).error === "interrupted" || (e as SpeechSynthesisErrorEvent).error === "canceled" ? opts.onEnd : opts.onError);
  synth.speak(u);
}

export function stopSpeaking() {
  if (isSpeechOutputSupported()) window.speechSynthesis.cancel();
}
