import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { z } from "zod";
import { authContextFromRequest } from "@/server/auth/request-context.server";
import type { AuthContext } from "@/integrations/supabase/auth-middleware";
import { runAssistant } from "@/assistant/assistant.service.server";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH, type AssistantResponse } from "@/assistant/assistant.types";
import { requestOrigin } from "@/assistant/sites/site-http.server";
import { resolveSiteForOrigin } from "@/assistant/sites/site-context.server";

const bodySchema = z.object({
  site: z.literal("antheticplus"),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(MAX_HISTORY_TURNS * 2)
    .default([]),
  language: z.string().trim().max(20).optional(),
  languageConfidence: z.number().min(0).max(1).optional(),
});

function event(controller: ReadableStreamDefaultController<Uint8Array>, name: string, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`));
}

function failure(requestId: string, message = "Something went wrong on our side. Please try again."): AssistantResponse {
  return {
    ok: false,
    error: { code: "internal", message },
    requestId,
  };
}

/**
 * First-party assistant stream. The server performs the structured tool-selection
 * phase first; only after it reaches tool:null does it stream plain-text final answer
 * deltas. Guest/authenticated policy and action-confirmation remain server-owned.
 */
export const Route = createFileRoute("/api/public/assistant/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = randomUUID();
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json(
            {
              ok: false,
              error: { code: "invalid_input", message: "That request wasn't valid." },
              requestId,
            },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          );
        }

        const origin = requestOrigin(request);
        const resolved = await resolveSiteForOrigin(parsed.site, origin, new URL(request.url).host);
        if (!resolved.ok) {
          return Response.json(
            { ok: false, error: { code: "forbidden", message: resolved.message }, requestId },
            { status: resolved.code === "invalid_site" ? 404 : 403, headers: { "Cache-Control": "no-store" } },
          );
        }

        let auth: AuthContext | null;
        try {
          auth = await authContextFromRequest(request);
        } catch (error) {
          if (error instanceof Response) {
            return Response.json(
              { ok: false, error: { code: "unauthenticated", message: "Please sign in again." }, requestId },
              { status: error.status, headers: { "Cache-Control": "no-store" } },
            );
          }
          console.error(`[assistant stream ${requestId}] auth failure`, error);
          return Response.json(
            { ok: false, error: { code: "unauthenticated", message: "Please sign in again." }, requestId },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        }

        const abort = new AbortController();
        const onRequestAbort = () => abort.abort();
        request.signal.addEventListener("abort", onRequestAbort, { once: true });

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            void (async () => {
              try {
                const result = await runAssistant({
                  auth,
                  history: parsed.history,
                  message: parsed.message,
                  requestId,
                  site: resolved.site,
                  providerKeyLabel: "Homepage Voice Agent",
                  ...(parsed.language !== undefined ? { language: parsed.language } : {}),
                  ...(parsed.languageConfidence !== undefined
                    ? { languageConfidence: parsed.languageConfidence }
                    : {}),
                  signal: abort.signal,
                  onReplyDelta: (delta) => {
                    if (!abort.signal.aborted) {
                      controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: delta })}\n\n`));
                    }
                  },
                });
                if (!abort.signal.aborted) {
                  event(controller, "complete", result);
                  controller.close();
                }
              } catch (error) {
                if (!abort.signal.aborted) {
                  console.error(`[assistant stream ${requestId}]`, error);
                  event(
                    controller,
                    "error",
                    failure(requestId, "I'm having trouble finishing that response right now. Please try again."),
                  );
                  controller.close();
                }
              } finally {
                request.signal.removeEventListener("abort", onRequestAbort);
              }
            })();
          },
          cancel() {
            abort.abort();
            request.signal.removeEventListener("abort", onRequestAbort);
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
