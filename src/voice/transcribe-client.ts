/** Browser side of speech-to-text: one request per utterance, cancellable. */
import { transcribeVoiceAudio } from "@/lib/voice-transcription.functions";
import type { Utterance } from "./mic-session";

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
  return { text: result.text.trim(), language: result.language ?? null };
}
