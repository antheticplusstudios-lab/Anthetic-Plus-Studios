import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { z } from "zod";
import { jsonResponse, preflightFor, requestOrigin, resolveFromRequest } from "@/assistant/sites/site-http.server";
import { runAssistant } from "@/assistant/assistant.service.server";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH } from "@/assistant/assistant.types";

const body = z.object({
  site: z.string().max(40),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(MAX_HISTORY_TURNS * 2).default([]),
});

/**
 * Public chat for the embedded widget. Always runs as an anonymous visitor
 * (auth: null), so only public, site-allowed tools are reachable regardless
 * of what the browser sends.
 */
export const Route = createFileRoute("/api/public/assistant/chat")({
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
          return jsonResponse({ ok: false, error: { code: "invalid_input", message: "That request wasn't valid." }, requestId }, 400, origin, false);
        }
        try {
          const res = await resolveFromRequest(request, parsed.site);
          if (!res.ok) return jsonResponse({ ok: false, error: { code: "forbidden", message: res.message }, requestId }, res.code === "invalid_site" ? 404 : 403, origin, false);
          const out = await runAssistant({ auth: null, history: parsed.history, message: parsed.message, requestId, site: res.site });
          return jsonResponse(out, 200, origin, true);
        } catch (e) {
          console.error(`[assistant public ${requestId}]`, e);
          return jsonResponse({ ok: false, error: { code: "internal", message: "Something went wrong on our side. Please try again." }, requestId }, 500, origin, false);
        }
      },
    },
  },
});
