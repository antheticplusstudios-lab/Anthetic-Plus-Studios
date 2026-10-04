import { createFileRoute } from "@tanstack/react-router";
import { widgetSource } from "@/lib/widget-runtime";

/** Backward-compatible loader: same Gen 2 runtime as /widget.js, token taken from the query string. */
export const Route = createFileRoute("/api/public/widget/script")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = (url.searchParams.get("token") ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
        const base = (process.env["VITE_API_GATEWAY_URL"] ?? "").replace(/\/$/, "");
        return new Response(widgetSource(base, token), {
          headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
