/** Pure helpers for the auto-training crawler. */
export const MAX_PAGES = 8;

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Same-host links worth reading (no files, anchors or login pages). */
export function sameHostLinks(html: string, base: string, limit = MAX_PAGES): string[] {
  const root = new URL(base);
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1]!, root);
      if (u.host !== root.host) continue;
      if (/\.(pdf|jpe?g|png|gif|svg|zip|mp4|css|js)$/i.test(u.pathname)) continue;
      if (/(login|signin|signup|auth|cart|checkout|wp-admin)/i.test(u.pathname)) continue;
      u.hash = "";
      u.search = "";
      out.add(u.toString());
      if (out.size >= limit) break;
    } catch {
      /* skip bad links */
    }
  }
  return [...out];
}

export function normalizeSiteUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".") ? u.origin + "/" : null;
  } catch {
    return null;
  }
}

export type JobStatus = "queued" | "running" | "done" | "failed";
export function jobProgress(j: { status: string; pages: number }) {
  if (j.status === "done") return 100;
  if (j.status === "failed") return 100;
  if (j.status === "queued") return 0;
  return Math.min(95, 10 + j.pages * Math.round(85 / MAX_PAGES));
}
