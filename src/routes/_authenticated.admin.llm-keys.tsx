import { createFileRoute, redirect } from "@tanstack/react-router";

// Provider key management now lives inside AI Infrastructure; keep old links working.
export const Route = createFileRoute("/_authenticated/admin/llm-keys")({
  head: () => ({
    meta: [
      { title: "Admin Llm Keys — AntheticPlus Studios" },
      {
        name: "description",
        content: "Admin Llm Keys in the AntheticPlus AI automation platform.",
      },
      { property: "og:title", content: "Admin Llm Keys — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Llm Keys in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/infrastructure", hash: "key-pool" });
  },
});
