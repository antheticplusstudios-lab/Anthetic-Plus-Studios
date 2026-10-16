/**
 * Client-side (browser) error reporting for React error boundaries.
 *
 * The previous implementation only forwarded to editor-specific globals that
 * existed only inside a hosted preview environment. Outside that iframe — i.e. in every real
 * deployment — those calls were silent no-ops, so nothing was actually
 * reported anywhere.
 *
 * This version always logs to the console (visible in the browser devtools
 * and picked up by any RUM/log-shipping agent you attach later). It is
 * intentionally NOT wired to a server table yet — that belongs with the
 * platform's real Security/Operations audit + error-tracking work
 * (see roadmap.md), not bolted on here as a half-implementation.
 */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[client-error]", {
    message,
    stack,
    route: window.location.pathname,
    ...context,
  });
}
