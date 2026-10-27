import { createFileRoute, redirect } from "@tanstack/react-router";

// Solutions merged into the Products page; keep the old URL working.
export const Route = createFileRoute("/solutions")({
  beforeLoad: () => {
    throw redirect({ to: "/automations", statusCode: 301 });
  },
});
