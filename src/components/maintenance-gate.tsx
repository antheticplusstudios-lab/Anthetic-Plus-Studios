import { useRouterState } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { HomeBrand } from "@/components/home-brand";
import { useRole } from "@/hooks/use-portal";
import { useMaintenance } from "@/hooks/use-system-settings";

/**
 * When maintenance mode is on, the storefront and client dashboard are replaced
 * by a notice. Staff keep full access so the Control Center stays usable.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const maintenance = useMaintenance();
  const { data: role } = useRole();

  const exempt = path.startsWith("/admin") || path.startsWith("/auth") || path.startsWith("/api");
  const staff = !!role && role !== "client";

  if (!maintenance.enabled || exempt || staff) return <>{children}</>;

  const message =
    String(maintenance.message ?? "").trim() ||
    "We are performing scheduled maintenance. Please check back shortly.";

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-16">
      <div className="max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <HomeBrand />
        </div>
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-secondary">
          <Wrench className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Back shortly</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
