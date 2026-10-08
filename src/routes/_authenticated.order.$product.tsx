import { createFileRoute, redirect } from "@tanstack/react-router";

const LEGACY_TO_CANONICAL: Record<string, string> = {
  ai_receptionist: "voice-sms-receptionist",
  messaging_ai: "social-dm-assistant",
  lead_capture: "lead-capture-qualifier",
  kb_support: "knowledge-base-support",
};

/**
 * Legacy order URLs are kept as compatibility redirects only.
 * The canonical four-product checkout is /checkout/$slug.
 */
export const Route = createFileRoute("/_authenticated/order/$product")({
  beforeLoad: ({ params }) => {
    const slug = LEGACY_TO_CANONICAL[params.product];
    if (!slug) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/checkout/$slug", params: { slug }, search: { plan: "monthly" } });
  },
  component: () => null,
});
