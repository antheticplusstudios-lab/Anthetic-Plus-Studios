import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;

function ipv4Blocked(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
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
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("ff")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return !!mapped && ipv4Blocked(mapped[1]);
}

function blockedIp(ip: string) {
  return isIP(ip) === 4 ? ipv4Blocked(ip) : isIP(ip) === 6 ? ipv6Blocked(ip) : true;
}

export async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Target host is not allowed");
  }
  const literalType = isIP(host);
  if (literalType) {
    if (blockedIp(host)) throw new Error("Target host is not allowed");
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => blockedIp(entry.address))) {
    throw new Error("Target host is not allowed");
  }
}

export async function safeFetch(initialUrl: string, init: RequestInit = {}) {
  let url = new URL(initialUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are allowed");

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertPublicHost(url.hostname);
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url: url.toString() };
    const location = response.headers.get("location");
    if (!location) return { response, url: url.toString() };
    if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects");
    url = new URL(location, url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Redirect target is not allowed");
  }
  throw new Error("Too many redirects");
}
