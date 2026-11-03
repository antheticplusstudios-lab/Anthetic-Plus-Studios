import { createFileRoute, redirect } from "@tanstack/react-router";

// Provider key management now lives inside AI Infrastructure; keep old links working.
export const Route = createFileRoute("/_authenticated/admin/llm-keys")({
  head: () => ({
    meta: [
      { title: "Admin Llm Keys — Autumic" },
      {
        name: "description",
        content: "Admin Llm Keys in the Autumic AI automation platform.",
      },
      { property: "og:title", content: "Admin Llm Keys — Autumic" },
      {
        property: "og:description",
        content: "Admin Llm Keys in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/infrastructure", hash: "key-pool" });
  },
});
