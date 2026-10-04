/**
 * Client-safe registry of the exactly-two websites served by the Web AI
 * Assistant. A site id only selects context; it never grants permissions.
 */
export const SITE_IDS = ["antheticplus", "autumic"] as const;
export type SiteId = (typeof SITE_IDS)[number];

export type SiteDefinition = {
  id: SiteId;
  name: string;
  /** Built-in public domains. Admins may add extra domains per site. */
  domains: string[];
  /** True when the site is this application itself (first-party origin). */
  firstParty: boolean;
};

export const SITES: Record<SiteId, SiteDefinition> = {
  antheticplus: { id: "antheticplus", name: "AntheticPlus", domains: [], firstParty: true },
  autumic: { id: "autumic", name: "Autumic", domains: ["autumic.com"], firstParty: false },
};

export function isSiteId(v: unknown): v is SiteId {
  return typeof v === "string" && (SITE_IDS as readonly string[]).includes(v);
}

/** Tools a site can be allowed to use. Account/action tools only ever work on the first-party site. */
export const SITE_TOOL_CATALOG: Array<{ name: string; label: string; firstPartyOnly: boolean; description: string }> = [
  { name: "search_site_knowledge", label: "Site knowledge search", firstPartyOnly: false, description: "Searches this site's approved knowledge only." },
  { name: "get_pricing", label: "AntheticPlus pricing", firstPartyOnly: true, description: "Live AntheticPlus plan prices." },
  { name: "get_account", label: "Account details", firstPartyOnly: true, description: "Signed-in user's own account." },
  { name: "get_subscriptions", label: "Subscriptions", firstPartyOnly: true, description: "Signed-in user's own subscriptions." },
  { name: "get_orders", label: "Orders", firstPartyOnly: true, description: "Signed-in user's own orders." },
  { name: "get_automation_status", label: "Automation status", firstPartyOnly: true, description: "Signed-in user's own automations." },
  { name: "retrieve_knowledge", label: "Automation knowledge", firstPartyOnly: true, description: "Knowledge of the user's own automations." },
  { name: "send_email", label: "Send email", firstPartyOnly: true, description: "Sends email after explicit confirmation." },
  { name: "platform_overview", label: "Platform overview (admin)", firstPartyOnly: true, description: "Admin-only platform summary." },
];
