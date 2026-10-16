import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProfileGate } from "@/components/profile-gate";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => (
    <DashboardShell>
      <ProfileGate>
        <Outlet />
      </ProfileGate>
    </DashboardShell>
  ),
});
