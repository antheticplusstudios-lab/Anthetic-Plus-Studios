/** Browser side of speech-to-text: one request per utterance, cancellable. */
import { transcribeVoiceAudio } from "@/lib/voice-transcription.functions";
import type { Utterance } from "./mic-session";
import { languageMetadataFrom } from "./language";

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeUtterance(
  u: Utterance,
  opts: { signal: AbortSignal; languageHint?: string | null },
): Promise<{ text: string; language: string | null }> {
  if (!u.blob.size) return { text: "", language: null };
  const audioBase64 = await toDataUrl(u.blob);
  if (opts.signal.aborted) throw new DOMException("aborted", "AbortError");
  const result = await transcribeVoiceAudio({
    data: {
      audioBase64,
      mimeType: u.mimeType,
      ...(opts.languageHint ? { languageHint: opts.languageHint } : {}),
    },
    signal: opts.signal,
  });
  const text = result.text.trim();
  if (!text) return { text: "", language: null };

  // Prefer the transcription provider's detected language. When it omits one,
  // infer a conservative language hint from recognized text and the prior turn.
  const detected = result.language
    ? languageMetadataFrom(text, result.language, 0.9)
    // Never let a previous turn override this turn's words: users commonly switch
    // between English, Bangla and Hindi in the same conversation.
    : languageMetadataFrom(text);
  return { text, language: detected.language };
}
