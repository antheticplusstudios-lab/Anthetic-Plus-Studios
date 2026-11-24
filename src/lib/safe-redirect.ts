/**
 * Validates a post-sign-in destination. Returns an internal path (pathname +
 * search + hash) or null for anything external, malformed, or an auth page
 * (which would loop back into sign-in).
 */
export function safeInternalRedirect(raw: unknown, origin: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  // Only accept root-relative paths or same-origin absolute URLs.
  if (!raw.startsWith("/") && !raw.startsWith(origin)) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.includes("\\") || [...raw].some((c) => c.charCodeAt(0) < 0x20)) return null;
  try {
    const target = new URL(raw, origin);
    if (target.origin !== origin) return null;
    // Re-check the normalized path: a same-origin URL like `${origin}//evil.com`
    // yields pathname "//evil.com", which the browser would treat as a new host.
    if (target.pathname.startsWith("//") || target.pathname.includes("\\")) return null;
    if (/%2f|%5c/i.test(target.pathname.slice(0, 4))) return null;
    if (target.pathname === "/auth" || target.pathname.startsWith("/auth/")) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** Builds the OAuth / email-confirmation callback URL carrying the destination. */
export function buildAuthCallbackUrl(origin: string, redirect?: string | null): string {
  const url = new URL("/auth/callback", origin);
  const next = safeInternalRedirect(redirect, origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}
