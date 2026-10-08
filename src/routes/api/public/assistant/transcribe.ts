import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  jsonResponse,
  preflightFor,
  requestOrigin,
  resolveFromRequest,
} from "@/assistant/sites/site-http.server";
import { loadAssistantSettings } from "@/assistant/assistant.settings.server";
import { transcribeVoiceAudioData } from "@/server/voice-transcription.server";

const body = z.object({
  site: z.string().max(40),
  audioBase64: z.string().startsWith("data:").max(4_000_000),
  mimeType: z.string().trim().max(100).default("audio/webm"),
});

export const Route = createFileRoute("/api/public/assistant/transcribe")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflightFor(request),
      POST: async ({ request }) => {
        const origin = requestOrigin(request);
        const requestId = randomUUID();
        let parsed: z.infer<typeof body>;
        try {
          parsed = body.parse(await request.json());
        } catch {
          return jsonResponse(
            {
              ok: false,
              error: { code: "invalid_input", message: "That audio request wasn't valid." },
              requestId,
            },
            400,
            origin,
            false,
          );
        }
        try {
          const res = await resolveFromRequest(request, parsed.site);
          if (!res.ok)
            return jsonResponse(
              { ok: false, error: { code: "forbidden", message: res.message }, requestId },
              res.code === "invalid_site" ? 404 : 403,
              origin,
              false,
            );
          const settings = await loadAssistantSettings();
          if (!settings.enabled || !res.site.config.enabled || !res.site.config.voiceEnabled)
            return jsonResponse(
              {
                ok: false,
                error: { code: "offline", message: "Voice is unavailable right now." },
                requestId,
              },
              503,
              origin,
              false,
            );
          const out = await transcribeVoiceAudioData(
            { audioBase64: parsed.audioBase64, mimeType: parsed.mimeType },
            request.signal,
          );
          return jsonResponse({ ok: true, ...out, requestId }, 200, origin, true);
        } catch (e) {
          console.error(`[assistant transcribe public ${requestId}]`, e);
          return jsonResponse(
            {
              ok: false,
              error: {
                code: "internal",
                message: "I couldn't understand that voice input. Please try again.",
              },
              requestId,
            },
            500,
            origin,
            false,
          );
        }
      },
    },
  },
});
