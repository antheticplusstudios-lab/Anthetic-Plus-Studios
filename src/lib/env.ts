// Client-safe public config. Only VITE_* values belong here — never secrets.
export const publicEnv = {
  appUrl: (import.meta.env["VITE_APP_URL"] as string | undefined) ?? "",
  fastapiWsUrl: (import.meta.env["VITE_FASTAPI_WS_URL"] as string | undefined) ?? "",
};

/** WebSocket endpoint for a conversation on the external FastAPI service. */
export function chatSocketUrl(conversationId: string): string | null {
  if (!publicEnv.fastapiWsUrl) return null;
  return `${publicEnv.fastapiWsUrl.replace(/\/$/, "")}/ws/chat/${encodeURIComponent(conversationId)}`;
}
