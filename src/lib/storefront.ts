/** The same availability rule drives product listings and solution destinations. */
export type ProductListing = { slug: string; active: boolean; listed?: boolean };
export function isListedProduct(slug: string, plans: readonly ProductListing[] = []): boolean {
  const plan = plans.find((item) => item.slug === slug);
  return plan
    ? plan.active && plan.listed !== false
    : ["voice-sms-receptionist", "social-dm-assistant"].includes(slug);
}
