// The two websites sharing this platform. Used for sign-up/order/running badges.
export type Platform = "antheticplus" | "autumic" | "other";

export const PLATFORM_LABEL: Record<Platform, string> = {
  antheticplus: "AntheticPlus",
  autumic: "Autumic",
  other: "Other",
};

export function platformOfDomain(domain: string | null | undefined): Platform {
  const d = (domain ?? "").toLowerCase();
  if (!d) return "antheticplus";
  if (d.includes("autumic")) return "autumic";
  if (d.includes("anthetic") || d.includes("localhost")) return "antheticplus";
  return "other";
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
