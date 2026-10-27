import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/suite/")({
  head: () => ({
    meta: [
      { title: "Admin Suite — AntheticPlus Studios" },
      { name: "description", content: "Admin Suite in the AntheticPlus AI automation platform." },
      { property: "og:title", content: "Admin Suite — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Suite in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/suite/$slug", params: { slug: "ai-receptionist" } });
  },
});
