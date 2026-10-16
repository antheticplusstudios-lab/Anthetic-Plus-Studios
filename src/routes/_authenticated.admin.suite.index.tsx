import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/suite/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/suite/$slug", params: { slug: "ai-receptionist" } });
  },
});
