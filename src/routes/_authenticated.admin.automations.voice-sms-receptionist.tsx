import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/voice-sms-receptionist")({
  head: () => ({
    meta: [
      {
        property: "og:title",
        content: "Admin Automations Voice Sms Receptionist — Autumic",
      },
      {
        property: "og:description",
        content: "Admin Automations Voice Sms Receptionist in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "voice-sms-receptionist control room — Autumic" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="ai_receptionist" />,
});
