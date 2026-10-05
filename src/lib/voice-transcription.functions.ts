/** Client-safe RPC bridge for multilingual speech-to-text. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  audioBase64: z.string().startsWith("data:").max(4_000_000),
  mimeType: z.string().trim().max(100).default("audio/webm"),
});

export const transcribeVoiceAudio = createServerFn({ method: "POST" })
  .validator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    const { transcribeVoiceAudioData } = await import(
      "@/server/voice-transcription.server"
    );

    return transcribeVoiceAudioData(data);
  });
