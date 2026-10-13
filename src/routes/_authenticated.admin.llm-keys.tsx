import { createFileRoute, redirect } from "@tanstack/react-router";

// Provider key management now lives inside AI Infrastructure; keep old links working.
export const Route = createFileRoute("/_authenticated/admin/llm-keys")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/infrastructure", hash: "key-pool" });
  },
});
