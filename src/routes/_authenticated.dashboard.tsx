import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProfileGate } from "@/components/profile-gate";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Autumic" },
      { name: "description", content: "Dashboard in the Autumic AI automation platform." },
      { property: "og:title", content: "Dashboard — Autumic" },
      {
        property: "og:description",
        content: "Dashboard in the Autumic AI automation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <DashboardShell>
      <ProfileGate>
        <Outlet />
      </ProfileGate>
    </DashboardShell>
  ),
});
