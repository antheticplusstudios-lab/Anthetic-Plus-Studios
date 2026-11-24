import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "@/lib/website-url";

describe("Website source URLs", () => {
  it.each([
    "https://example.com",
    "https://www.example.com/",
    "https://example.com/docs",
    "https://example.com/docs?q=hello#section",
  ])("accepts public URL %s without losing its path", (value) => {
    expect(normalizeWebsiteUrl(` ${value} `)).toBe(new URL(value).toString());
  });
  it("rejects malformed addresses", () =>
    expect(() => normalizeWebsiteUrl("not a website")).toThrow("complete website URL"));
  it("rejects unsupported protocols", () =>
    expect(() => normalizeWebsiteUrl("ftp://example.com")).toThrow("HTTP and HTTPS"));
  it.each([
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://169.254.169.254",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://localhost",
    "http://[::1]",
  ])("rejects unsafe destination %s", (value) =>
    expect(() => normalizeWebsiteUrl(value)).toThrow("public website"),
  );
  it("rejects URL credentials", () =>
    expect(() => normalizeWebsiteUrl("https://user:password@example.com")).toThrow(
      "usernames or passwords",
    ));
});
