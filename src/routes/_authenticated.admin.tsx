import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Loading } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useRole } from "@/hooks/use-portal";

/**
 * Access matrix:
 *  - owner / admin / partner → every control-center page allowed by backend RBAC
 *  - verifier               → the verification queue only
 *  - client                  → never; bounced to the client dashboard
 * Backend auth/RBAC/RLS remain the security boundary; this gate is a UX layer.
 */
function AdminGate() {
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const { data: role, isLoading: roleLoading, error: roleError, refetch: refetchRole } = useRole();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();

  const ready = !userLoading && !roleLoading;
  const isStaff = role === "owner" || role === "admin" || role === "partner" || role === "verifier";
  const isVerifier = role === "verifier";
  const onQueue = path.startsWith("/admin/verification");
  const offLimits = isVerifier && !onQueue;

  useEffect(() => {
    if (!ready || userError || roleError) return;
    if (!user || !isStaff) void navigate({ to: "/dashboard", replace: true });
    else if (offLimits) void navigate({ to: "/admin/verification", replace: true });
  }, [ready, user, userError, roleError, isStaff, offLimits, navigate]);

  if (!ready) return <Loading label="Checking your access" />;

  if (userError || roleError) {
    const message =
      userError instanceof Error
        ? userError.message
        : roleError instanceof Error
          ? roleError.message
          : "Could not verify your admin access.";
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
        <h1 className="text-xl font-bold">Admin access could not be verified</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void refetchUser();
              void refetchRole();
            }}
          >
            Retry
          </Button>
          <Button onClick={() => void navigate({ to: "/dashboard", replace: true })}>
            Return to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!user || !isStaff) return null;
  if (offLimits) return <Loading label="Redirecting to Verification Queue" />;

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminGate,
});
