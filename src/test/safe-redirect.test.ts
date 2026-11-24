import { describe, expect, it } from "vitest";
import { buildAuthCallbackUrl, safeInternalRedirect } from "@/lib/safe-redirect";

const O = "https://app.autumic.com";

describe("safeInternalRedirect", () => {
  it("keeps an internal admin path with query and hash", () => {
    expect(safeInternalRedirect("/admin/automations?tab=a#x", O)).toBe(
      "/admin/automations?tab=a#x",
    );
  });
  it("accepts a same-origin absolute URL", () => {
    expect(safeInternalRedirect(`${O}/dashboard/orders`, O)).toBe("/dashboard/orders");
  });
  it("rejects external and protocol-relative destinations", () => {
    expect(safeInternalRedirect("https://evil.com/x", O)).toBeNull();
    expect(safeInternalRedirect("//evil.com/x", O)).toBeNull();
    expect(safeInternalRedirect("/\\evil.com", O)).toBeNull();
    expect(safeInternalRedirect("javascript:alert(1)", O)).toBeNull();
  });
  it("rejects same-origin absolute URLs whose path starts with //", () => {
    expect(safeInternalRedirect(`${O}//evil.com`, O)).toBeNull();
    expect(safeInternalRedirect(`${O}//evil.com/x?y=1`, O)).toBeNull();
    expect(safeInternalRedirect(`${O}///evil.com`, O)).toBeNull();
  });
  it("rejects backslash and control-character authority tricks", () => {
    expect(safeInternalRedirect(`${O}/\\evil.com`, O)).toBeNull();
    expect(safeInternalRedirect("/\\/evil.com", O)).toBeNull();
    expect(safeInternalRedirect("/x\\evil.com", O)).toBeNull();
    expect(safeInternalRedirect("/\t/evil.com", O)).toBeNull();
    expect(safeInternalRedirect("/%2F/evil.com", O)).toBeNull();
  });
  it("rejects auth pages to avoid sign-in loops", () => {
    expect(safeInternalRedirect("/auth", O)).toBeNull();
    expect(safeInternalRedirect("/auth/callback?next=/x", O)).toBeNull();
  });
});

describe("buildAuthCallbackUrl", () => {
  it("carries the original destination through the OAuth callback", () => {
    const url = new URL(buildAuthCallbackUrl(O, "/admin/automations"));
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/admin/automations");
  });
  it("drops an unsafe destination", () => {
    expect(new URL(buildAuthCallbackUrl(O, "https://evil.com")).searchParams.has("next")).toBe(
      false,
    );
  });
});
