export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "ACTIVE" | "GRACE_PERIOD" | "REVOKED";

export const CYCLE_DAYS: Record<BillingCycle, number> = { monthly: 30, yearly: 365 };

export type BillingPeriod = { start: Date; end: Date; days: number };

/** Chronos period math — always UTC, mirrors the database revocation rule. */
export function computePeriod(cycle: BillingCycle, start: Date = new Date()): BillingPeriod {
  const days = CYCLE_DAYS[cycle];
  const end = new Date(start.getTime() + days * 86_400_000);
  return { start, end, days };
}

export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function statusFor(end: Date, now: Date = new Date()): SubscriptionStatus {
  return end.getTime() > now.getTime() ? "ACTIVE" : "REVOKED";
}
