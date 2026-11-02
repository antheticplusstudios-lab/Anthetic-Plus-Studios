import { createFileRoute, redirect } from "@tanstack/react-router";

// The solutions overview lives on the homepage; preserve the legacy URL and scroll to it.
export const Route = createFileRoute("/solutions")({
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "solutions", statusCode: 301 });
  },
});
