import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicHost, readLimitedText, safeFetch } from "@/lib/safe-fetch.server";

const dns = (ip: string) =>
  new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: ip }] }));

afterEach(() => vi.unstubAllGlobals());

describe("Partner website fetching (SSRF protection)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.0.5",
    "localhost",
    "metadata.internal",
  ])("blocks internal host %s", async (host) => {
    await expect(assertPublicHost(host)).rejects.toThrow("not allowed");
  });

  it("blocks a public name that resolves to a private address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => dns("10.0.0.7")),
    );
    await expect(assertPublicHost("evil.example")).rejects.toThrow("not allowed");
  });

  it("blocks redirects to internal addresses", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cloudflare-dns")) return dns("93.184.216.34");
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("https://example.com")).rejects.toThrow("not allowed");
  });

  it("blocks redirects outside approved domains", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("cloudflare-dns")
          ? dns("93.184.216.34")
          : new Response(null, { status: 301, headers: { location: "https://other.com/" } }),
      ),
    );
    await expect(
      safeFetch("https://example.com", {}, (u) => new URL(u).hostname === "example.com"),
    ).rejects.toThrow("approved website domains");
  });

  it("rejects non-HTTP protocols and odd ports", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow("HTTP");
    await expect(safeFetch("https://example.com:8443")).rejects.toThrow("not allowed");
  });

  it("follows a safe redirect and keeps the final URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("cloudflare-dns")) return dns("93.184.216.34");
        if (url === "https://example.com/")
          return new Response(null, { status: 301, headers: { location: "/docs" } });
        return new Response("ok");
      }),
    );
    const { url } = await safeFetch("https://example.com/");
    expect(url).toBe("https://example.com/docs");
  });

  it("enforces the read size limit", async () => {
    await expect(readLimitedText(new Response("x".repeat(20)), 10)).rejects.toThrow("size limit");
  });
});
