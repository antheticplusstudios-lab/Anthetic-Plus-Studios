import { createFileRoute, redirect } from "@tanstack/react-router";

// The solutions overview lives on the homepage; preserve the legacy URL and scroll to it.
export const Route = createFileRoute("/solutions")({
  head: () => ({
    meta: [
      { title: "Automation Solutions — Autumic" },
      {
        name: "description",
        content:
          "Explore Autumic’s automation solutions for customer communication and business operations.",
      },
      { property: "og:title", content: "Automation Solutions — Autumic" },
      {
        property: "og:description",
        content:
          "Explore Autumic’s automation solutions for customer communication and business operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "solutions", statusCode: 301 });
  },
});
