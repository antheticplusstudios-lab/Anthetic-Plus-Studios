import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/voice-sms-receptionist")({
  head: () => ({
    meta: [
      {
        property: "og:title",
        content: "Admin Automations Voice Sms Receptionist — AntheticPlus Studios",
      },
      {
        property: "og:description",
        content:
          "Admin Automations Voice Sms Receptionist in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "voice-sms-receptionist control room — AntheticPlus" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="ai_receptionist" />,
});
