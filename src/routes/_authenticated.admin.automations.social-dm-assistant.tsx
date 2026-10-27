import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/social-dm-assistant")({
  head: () => ({
    meta: [
      {
        property: "og:title",
        content: "Admin Automations Social Dm Assistant — AntheticPlus Studios",
      },
      {
        property: "og:description",
        content:
          "Admin Automations Social Dm Assistant in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "social-dm-assistant control room — AntheticPlus" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="messaging_ai" />,
});
