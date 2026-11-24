/** All four Autumic automation products remain visible; availability is not coupled to price-table outages. */
export type ProductListing = { slug: string; active: boolean; listed?: boolean };
const AUTUMIC_PRODUCTS = new Set([
  "voice-sms-receptionist",
  "lead-capture-qualifier",
  "knowledge-base-support",
  "social-dm-assistant",
]);
export function isListedProduct(slug: string, _plans: readonly ProductListing[] = []): boolean {
  return AUTUMIC_PRODUCTS.has(slug);
}
