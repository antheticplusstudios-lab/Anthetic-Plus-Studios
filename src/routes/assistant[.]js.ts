import { createFileRoute } from "@tanstack/react-router";
import { assistantWidgetSource } from "@/assistant/widget/assistant-widget-source";

/** Embeddable Web Assistant: <script src="https://<app>/assistant.js" data-site-id="autumic"></script> */
export const Route = createFileRoute("/assistant.js")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const base = new URL(request.url).origin;
        return new Response(assistantWidgetSource(base), {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
