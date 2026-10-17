/**
 * Whisper hallucination guard (pure, unit-tested).
 * Whisper invents text for silence/noise ("Thank you.", "Thanks for watching!"). Using the
 * verbose_json segment statistics we drop segments that are almost certainly not speech.
 */
export type WhisperSegment = {
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

const PHANTOMS = [
  /^(thank you|thanks)( (so much|very much|for watching|for listening))?[.!]*$/i,
  /^(bye|you|okay|uh|um|hmm)[.!]*$/i,
  /subtitles? (by|created)/i,
  /^\[?(music|applause|silence|noise|blank_audio)\]?$/i,
  /^[.\s…]*$/,
];

export function keepSegment(s: WhisperSegment): boolean {
  const noSpeech = s.no_speech_prob ?? 0;
  const logprob = s.avg_logprob ?? 0;
  if (noSpeech > 0.6 && logprob < -0.7) return false;
  if (logprob < -1.2) return false;
  if ((s.compression_ratio ?? 0) > 2.6) return false; // repetitive loop
  return true;
}

export function cleanTranscript(text: string, segments?: WhisperSegment[] | null): string {
  let out = text.trim();
  if (segments && segments.length) {
    const kept = segments.filter(keepSegment);
    if (kept.length !== segments.length) {
      out = kept
        .map((s) => (s.text ?? "").trim())
        .join(" ")
        .trim();
    }
  }
  if (PHANTOMS.some((re) => re.test(out))) {
    // Only a phantom if the whole transcript is that phrase AND confidence is not high.
    const confident =
      segments?.length === 1 &&
      (segments[0]!.no_speech_prob ?? 1) < 0.2 &&
      (segments[0]!.avg_logprob ?? -9) > -0.4;
    if (!confident || /^[.\s…]*$/.test(out) || /subtitle|\[/.test(out)) return "";
  }
  return out;
}

/** Filename extension Groq/Whisper uses to pick the decoder. Wrong extension = failed decode. */
export function audioFileName(mimeType: string) {
  const m = mimeType.toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "voice.m4a";
  if (m.includes("ogg")) return "voice.ogg";
  if (m.includes("wav")) return "voice.wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "voice.mp3";
  return "voice.webm";
}
