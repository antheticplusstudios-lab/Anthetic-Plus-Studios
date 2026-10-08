import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/voice-sms-receptionist")({
  head: () => ({
    meta: [
      { title: "voice-sms-receptionist control room — AntheticPlus" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="ai_receptionist" />,
});
