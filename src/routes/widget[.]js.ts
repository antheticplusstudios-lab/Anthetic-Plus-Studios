import { createFileRoute } from "@tanstack/react-router";
import { widgetSource } from "@/lib/widget-runtime";

export const Route = createFileRoute("/widget.js")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const base = (process.env["VITE_API_GATEWAY_URL"] ?? "").replace(/\/$/, "");
        return new Response(widgetSource(base), {
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
