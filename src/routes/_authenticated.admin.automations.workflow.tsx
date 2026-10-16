import { createFileRoute, redirect } from "@tanstack/react-router";

/** Compatibility redirect: durable workflow execution is an internal runtime capability, not a storefront product. */
export const Route = createFileRoute("/_authenticated/admin/automations/workflow")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/automations" });
  },
});
