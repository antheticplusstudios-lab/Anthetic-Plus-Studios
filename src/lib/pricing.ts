import { queryOptions, useQuery } from "@tanstack/react-query";
import { automations, type Automation } from "@/lib/automations";
import { getLivePricing, type LivePlan } from "@/lib/pricing.functions";

export const livePricingQueryOptions = queryOptions({
  queryKey: ["live-pricing"],
  queryFn: () => getLivePricing(),
  staleTime: 60_000,
});

/** Browser copy of the price matrix; the catalog price is the offline fallback. */
export function useLivePricing() {
  return useQuery(livePricingQueryOptions);
}

export type PricedAutomation = {
  slug: string;
  name: string;
  shortName: string;
  icon: Automation["icon"];
  badge: Automation["badge"];
  description: string;
  features: readonly string[];
  useCases: readonly string[];
  price: number;
  yearlyDiscountPct: number;
  yearlyPrice: number;
  monthlyOf(yearly: boolean): number;
  listed: boolean;
};

export function priceOf(plan: LivePlan) {
  const yearlyDiscountPct = plan.yearly_discount_pct ?? 0;
  const monthlyBase = Number(plan.monthly_price);
  const monthlyWhenYearly = Math.round(monthlyBase * (1 - yearlyDiscountPct / 100));
  return {
    monthlyBase,
    yearlyDiscountPct,
    monthlyWhenYearly,
    yearlyTotal: monthlyWhenYearly * 12,
  };
}

const STOREFRONT_DEFAULT = ["voice-sms-receptionist", "social-dm-assistant"];

/** Merge the marketing catalog (copy, icons, features) with the live database prices. */
export function withLivePricing(plans: LivePlan[] | undefined): PricedAutomation[] {
  const bySlug = new Map((plans ?? []).map((plan) => [plan.slug, plan]));
  return automations.map((item) => {
    const plan = bySlug.get(item.slug);
    const monthlyBase = plan ? Number(plan.monthly_price) : item.price;
    const yearlyDiscountPct = plan ? plan.yearly_discount_pct : 20;
    const monthlyWhenYearly = Math.round(monthlyBase * (1 - yearlyDiscountPct / 100));
    return {
      ...item,
      price: monthlyBase,
      yearlyDiscountPct,
      yearlyPrice: monthlyWhenYearly * 12,
      monthlyOf: (yearly: boolean) => (yearly ? monthlyWhenYearly : monthlyBase),
      listed: plan ? plan.listed !== false && plan.active : STOREFRONT_DEFAULT.includes(item.slug),
    };
  });
}

export function findPriced(slug: string, plans: LivePlan[] | undefined) {
  return withLivePricing(plans).find((item) => item.slug === slug);
}

/** Apply an approved promo percentage to a total. */
export function withDiscount(amount: number, percentOff: number | null) {
  if (!percentOff) return { amount, saved: 0 };
  const next = Math.round(amount * (1 - percentOff / 100));
  return { amount: next, saved: amount - next };
}

/** Automations visitors see in public lists (owner toggles "Show on website" in the admin catalog). */
export function storefrontItems(plans: LivePlan[] | undefined) {
  return withLivePricing(plans).filter((i) => i.listed);
}
