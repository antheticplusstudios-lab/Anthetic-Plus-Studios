import { createFileRoute, redirect } from "@tanstack/react-router";

/** Compatibility redirect: durable workflow execution is an internal runtime capability, not a storefront product. */
export const Route = createFileRoute("/_authenticated/admin/automations/workflow")({
  head: () => ({
    meta: [
      { title: "Admin Automations Workflow — AntheticPlus Studios" },
      {
        name: "description",
        content: "Admin Automations Workflow in the AntheticPlus AI automation platform.",
      },
      { property: "og:title", content: "Admin Automations Workflow — AntheticPlus Studios" },
      {
        property: "og:description",
        content: "Admin Automations Workflow in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/admin/automations" });
  },
});
