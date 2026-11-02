import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/lead-capture-qualifier")({
  head: () => ({
    meta: [
      {
        property: "og:title",
        content: "Admin Automations Lead Capture Qualifier — Autumic",
      },
      {
        property: "og:description",
        content:
          "Admin Automations Lead Capture Qualifier in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "lead-capture-qualifier control room — Autumic" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="lead_capture" />,
});
