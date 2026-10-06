import { createFileRoute } from "@tanstack/react-router";
import {
  jsonResponse,
  preflightFor,
  requestOrigin,
  resolveFromRequest,
} from "@/assistant/sites/site-http.server";
import { toPublicConfig } from "@/assistant/sites/site-config.server";
import { loadAssistantSettings } from "@/assistant/assistant.settings.server";

export const Route = createFileRoute("/api/public/assistant/config")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => preflightFor(request),
      GET: async ({ request }) => {
        const origin = requestOrigin(request);
        try {
          const res = await resolveFromRequest(
            request,
            new URL(request.url).searchParams.get("site"),
          );
          if (!res.ok)
            return jsonResponse(
              { error: res.message, code: res.code },
              res.code === "invalid_site" ? 404 : 403,
              origin,
              false,
            );
          const global = await loadAssistantSettings();
          return jsonResponse(
            toPublicConfig(res.site.id, res.site.config, global.enabled),
            200,
            origin,
            true,
          );
        } catch (e) {
          console.error("assistant public config failed", e);
          return jsonResponse(
            { error: "The assistant is unavailable right now.", code: "internal" },
            500,
            origin,
            false,
          );
        }
      },
    },
  },
});
