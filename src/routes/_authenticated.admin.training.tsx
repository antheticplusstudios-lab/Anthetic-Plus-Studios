import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin-ui";
import { TrainingPanel } from "@/components/training-panel";

export const Route = createFileRoute("/_authenticated/admin/training")({
  head: () => ({
    meta: [
      { title: "Auto-training — AntheticPlus Admin" },
      {
        name: "description",
        content: "Train website assistants and client automations from their websites.",
      },
    ],
  }),
  component: () => (
    <AdminPage
      title="Auto-training"
      subtitle="Keep both website assistants and every client automation up to date. Runs also happen on a schedule."
    >
      <TrainingPanel />
    </AdminPage>
  ),
});
