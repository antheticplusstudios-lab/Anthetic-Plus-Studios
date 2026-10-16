import { describe, expect, it } from "vitest";
import { htmlToText, jobProgress, normalizeSiteUrl, sameHostLinks } from "@/lib/training";

describe("auto-training helpers", () => {
  it("strips scripts and tags", () => {
    expect(htmlToText("<script>x()</script><h1>Hi</h1><p>We fix&nbsp;teeth</p>")).toBe(
      "Hi\nWe fix teeth",
    );
  });
  it("keeps only same-site pages", () => {
    const html = `<a href="/about">a</a><a href="https://other.com/x">b</a><a href="/file.pdf">c</a><a href="/login">d</a>`;
    expect(sameHostLinks(html, "https://shop.com/")).toEqual(["https://shop.com/about"]);
  });
  it("normalizes website addresses", () => {
    expect(normalizeSiteUrl("autumic.com")).toBe("https://autumic.com/");
    expect(normalizeSiteUrl("nope")).toBeNull();
  });
  it("reports progress", () => {
    expect(jobProgress({ status: "queued", pages: 0 })).toBe(0);
    expect(jobProgress({ status: "done", pages: 3 })).toBe(100);
  });
});
