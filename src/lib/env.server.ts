// Server-only config. Call inside handlers so env is read per request.
export function serverEnv() {
  return {
    appUrl: process.env["VITE_APP_URL"] ?? process.env["APP_URL"] ?? "",
    fastapiBackendUrl: process.env["FASTAPI_BACKEND_URL"] ?? "",
    fastapiWsUrl: process.env["FASTAPI_WS_URL"] ?? "",
  };
}
