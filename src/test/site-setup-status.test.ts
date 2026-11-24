import { describe, expect, it } from "vitest";
import { normalizeConfig, setupStatus } from "@/assistant/sites/site-config.server";
import { validateDomains } from "@/lib/web-assistant-admin.functions";

describe("site setup status", () => {
  it("reports an unsaved partner site with defaults as not set up and disabled", () => {
    const c = normalizeConfig("ny-partners", undefined);
    expect(c.enabled).toBe(false);
    const s = setupStatus("ny-partners", c, false, null);
    expect(s.missing).toContain("Settings have never been saved");
    expect(s.missing).toContain("Allowed website domain");
  });
  it("is ready once domain, business info and contact are saved", () => {
    const c = normalizeConfig("ny-partners", {
      extraDomains: ["example.com"],
      businessInfo: "Verified info",
      contact: "hello@example.com",
    });
    expect(setupStatus("ny-partners", c, true, "2026-01-01").missing).toEqual([]);
  });
  it("rejects invalid domains", () => {
    expect(validateDomains(["example.com"])).toBeNull();
    expect(validateDomains(["https://example.com/x"])).toMatch(/not a valid domain/);
    expect(validateDomains(undefined)).toBeNull();
  });
});
