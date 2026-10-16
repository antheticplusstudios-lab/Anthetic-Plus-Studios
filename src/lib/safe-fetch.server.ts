import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

function ipv4Blocked(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = p[0] ?? -1;
  const b = p[1] ?? -1;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Blocked(ip: string) {
  const value = ip.toLowerCase();
  if (value === "::1" || value === "::") return true;
  // Link-local, unique-local, multicast and IPv4-mapped private/link-local ranges.
  if (
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb")
  )
    return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("ff")) return true;
  // Conservatively reject mapped / compatible / transition forms.
  if (
    value.startsWith("::") ||
    value.startsWith("64:ff9b:") ||
    value.startsWith("2002:") ||
    value.startsWith("2001:0:")
  )
    return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return !!mapped && !!mapped[1] && ipv4Blocked(mapped[1]);
}

function blockedIp(ip: string) {
  return isIP(ip) === 4 ? ipv4Blocked(ip) : isIP(ip) === 6 ? ipv6Blocked(ip) : true;
}

export async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("Target host is not allowed");
  }
  const literalType = isIP(host);
  if (literalType) {
    if (blockedIp(host)) throw new Error("Target host is not allowed");
    return;
  }
  // Worker-compatible DNS resolution: fail closed if resolution is unavailable.
  const answers = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        },
      );
      if (!response.ok) throw new Error("Website DNS could not be verified. Please retry.");
      const data = (await response.json()) as {
        Status?: number;
        Answer?: Array<{ type: number; data: string }>;
      };
      if (data.Status !== 0) throw new Error("Website DNS could not be verified. Please retry.");
      return (data.Answer ?? [])
        .filter((entry) => entry.type === 1 || entry.type === 28)
        .map((entry) => entry.data);
    }),
  );
  const addresses = answers.flat();
  if (!addresses.length || addresses.some(blockedIp)) throw new Error("Target host is not allowed");
}

export async function safeFetch(
  initialUrl: string,
  init: RequestInit = {},
  allowedTarget?: (url: string) => boolean,
) {
  let url = new URL(initialUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP(S) URLs are allowed");

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443"))
      throw new Error("Target URL is not allowed");
    if (allowedTarget && !allowedTarget(url.toString()))
      throw new Error("Redirected outside the approved website domains.");
    await assertPublicHost(url.hostname);
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, url: url.toString() };
    const location = response.headers.get("location");
    if (!location) return { response, url: url.toString() };
    if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects");
    url = new URL(location, url);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("Redirect target is not allowed");
  }
  throw new Error("Too many redirects");
}

/** Enforce size limits while reading, not after downloading an unbounded body. */
export async function readLimitedText(response: Response, maxBytes = 1_500_000) {
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("Website content exceeds the size limit.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Website content exceeds the size limit.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
