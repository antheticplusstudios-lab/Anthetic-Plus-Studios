// Customer order journey. Pure: stage is DERIVED from real DB2 order/payment/deployment state — never assumed.

export const JOURNEY = [
  { key: "review", label: "Review order" },
  { key: "submitted", label: "Payment submitted" },
  { key: "verification", label: "Human verification" },
  { key: "configuration", label: "Configuration" },
  { key: "testing", label: "Testing" },
  { key: "active", label: "Active" },
] as const;
export type JourneyKey = (typeof JOURNEY)[number]["key"];

export function journeyStage(s: {
  orderStatus?: string | null;
  paymentStatus?: string | null;
  deploymentState?: string | null;
  setupComplete?: boolean;
}): { key: JourneyKey; index: number; blocked: string | null } {
  const at = (key: JourneyKey, blocked: string | null = null) => ({
    key,
    index: JOURNEY.findIndex((j) => j.key === key),
    blocked,
  });
  const pay = (s.paymentStatus ?? "").toLowerCase();
  const order = (s.orderStatus ?? "").toLowerCase();
  if (pay === "rejected" || order === "rejected" || order === "cancelled")
    return at("verification", "Payment was not verified. Contact support or resubmit.");
  if (!order && !pay) return at("review");
  if (s.deploymentState === "active") return at("active");
  if (s.deploymentState === "testing") return at("testing");
  if (s.deploymentState && s.deploymentState !== "provisioning")
    return at(s.setupComplete ? "testing" : "configuration");
  if (
    pay === "verified" ||
    pay === "approved" ||
    order === "verified" ||
    order === "paid" ||
    order === "approved"
  )
    return at("configuration");
  return at("verification");
}

/** Client-side duplicate guard: the same transaction ID can only be submitted once per browser session. */
export function draftKey(slug: string) {
  return `ap-checkout-draft:${slug}`;
}
