import { createFileRoute } from "@tanstack/react-router";
import { AutomationControlRoom } from "@/components/automation-control-room";

export const Route = createFileRoute("/_authenticated/admin/automations/knowledge-base-support")({
  head: () => ({
    meta: [
      {
        property: "og:title",
        content: "Admin Automations Knowledge Base Support — AntheticPlus Studios",
      },
      {
        property: "og:description",
        content:
          "Admin Automations Knowledge Base Support in the AntheticPlus AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },

      { title: "knowledge-base-support control room — AntheticPlus" },
      {
        name: "description",
        content: "Deployments, configuration, provider pool, executions and health.",
      },
    ],
  }),
  component: () => <AutomationControlRoom kind="kb_support" />,
});
