import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { preflightFor, requestOrigin, resolveFromRequest } from "@/assistant/sites/site-http.server";
import { loadAssistantSettings } from "@/assistant/assistant.settings.server";
import { enforceWebsiteTtsRateLimit, getVoiceTtsConfig, logWebsiteTtsRequest, streamWebsiteSpeech } from "@/lib/voice-tts.server";
import { cors } from "@/assistant/sites/site-http.server";

const body = z.object({
  site: z.string().max(40),
  text: z.string().trim().min(1).max(6000),
  language: z.string().trim().max(20).optional(),
});

export const Route = createFileRoute("/api/public/assistant/tts")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflightFor(request),
      POST: async ({ request }) => {
        const origin = requestOrigin(request);
        let parsed: z.infer<typeof body>;
        try {
          parsed = body.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ ok: false, error: { code: "invalid_input", message: "That speech request wasn't valid." } }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...cors(origin, false) },
          });
        }

        try {
          const resolved = await resolveFromRequest(request, parsed.site);
          if (!resolved.ok) {
            return new Response(JSON.stringify({ ok: false, error: { code: "forbidden", message: resolved.message } }), {
              status: resolved.code === "invalid_site" ? 404 : 403,
              headers: { "Content-Type": "application/json", ...cors(origin, false) },
            });
          }
          const settings = await loadAssistantSettings();
          if (!settings.enabled || !resolved.site.config.enabled || !resolved.site.config.voiceEnabled) {
            return new Response(JSON.stringify({ ok: false, error: { code: "offline", message: "Voice is unavailable right now." } }), {
              status: 503,
              headers: { "Content-Type": "application/json", ...cors(origin, false) },
            });
          }

          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || null;
          const limit = await enforceWebsiteTtsRateLimit({ siteId: resolved.site.id, text: parsed.text, ip, origin });
          if (!limit.allowed) {
            return new Response(JSON.stringify({ ok: false, error: { code: "rate_limited", message: "Voice is temporarily rate-limited. Please try again shortly." } }), {
              status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(limit.retryAfter), ...cors(origin, false) },
            });
          }
          const started = Date.now();
          const config = await getVoiceTtsConfig();
          if (!config) {
            return new Response(JSON.stringify({ ok: false, error: { code: "offline", message: "Multilingual voice is not configured yet." } }), {
              status: 503, headers: { "Content-Type": "application/json", ...cors(origin, false) },
            });
          }
          void logWebsiteTtsRequest({ keyId: config.keyId, siteId: resolved.site.id, clientHash: limit.clientHash, chars: limit.chars, language: parsed.language || "auto", model: config.model, status: "success", latencyMs: Date.now() - started });
          const result = await streamWebsiteSpeech({ text: parsed.text, language: parsed.language, signal: request.signal });
          return new Response(result.stream, {
            status: 200,
            headers: {
              "Content-Type": result.contentType || "audio/mpeg",
              "Cache-Control": "no-store",
              Vary: "Origin",
              ...(origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : {}),
              "X-AP-TTS-Language": result.language.language,
              "X-AP-TTS-Locale": result.language.locale,
              "X-AP-TTS-Provider": result.provider,
              "X-AP-TTS-Model": result.model,
            },
          });
        } catch (e) {
          console.error("[assistant tts]", e);
          return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "I couldn't generate speech right now." } }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...cors(origin, false) },
          });
        }
      },
    },
  },
});
