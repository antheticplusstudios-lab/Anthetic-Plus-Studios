/** Pure validation shared by website source forms and their server boundary. */
export function normalizeWebsiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete website URL, such as https://example.com/docs.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only HTTP and HTTPS website URLs are supported.");
  if (url.username || url.password)
    throw new Error("Website URLs must not include usernames or passwords.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host === "localhost" ||
    host.includes(":")
  )
    throw new Error("Use a public website address, not a private or internal destination.");
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every(Number.isInteger)) {
    const [a = 0, b = 0] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    )
      throw new Error("Use a public website address, not a private or internal destination.");
  }
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new Error("Website sources must use standard web ports.");
  return url.toString();
}
