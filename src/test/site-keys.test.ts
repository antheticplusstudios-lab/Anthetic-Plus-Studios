import { describe, expect, it } from "vitest";
import { checkKey, kindOf, normalizeStore, toView, type SiteKeyRecord } from "@/lib/site-keys";

const rec = (o: Partial<SiteKeyRecord> = {}): SiteKeyRecord => ({
  id: "k1",
  label: "w",
  kind: "publishable",
  scopes: ["chat"],
  prefix: "ap_pk_ab",
  hash: "h1",
  createdAt: "",
  createdBy: "u",
  rotatedAt: null,
  revokedAt: null,
  revokeReason: null,
  lastUsedAt: null,
  version: 1,
  ...o,
});

describe("site key verification", () => {
  it("accepts a matching active key with the scope", () => {
    expect(
      checkKey({ requireEmbedKey: false, keys: [rec()] }, "h1", "publishable", "chat").ok,
    ).toBe(true);
  });
  it("rejects a revoked key", () => {
    expect(
      checkKey(
        { requireEmbedKey: false, keys: [rec({ revokedAt: "x" })] },
        "h1",
        "publishable",
        "chat",
      ),
    ).toEqual({ ok: false, reason: "revoked" });
  });
  it("rejects a key without the requested scope", () => {
    expect(
      checkKey({ requireEmbedKey: false, keys: [rec()] }, "h1", "publishable", "voice"),
    ).toEqual({ ok: false, reason: "scope" });
  });
  it("rejects a website key used as a server key", () => {
    expect(checkKey({ requireEmbedKey: false, keys: [rec()] }, "h1", "secret", "chat")).toEqual({
      ok: false,
      reason: "kind",
    });
  });
  it("never exposes the hash in the admin view", () => {
    expect("hash" in toView(rec())).toBe(false);
  });
  it("detects key kind from prefix", () => {
    expect(kindOf("ap_sk_x")).toBe("secret");
    expect(kindOf("ap_pk_x")).toBe("publishable");
    expect(kindOf("sk_live")).toBeNull();
  });
  it("drops unknown scopes from stored data", () => {
    const s = normalizeStore({ keys: [rec({ scopes: ["chat", "admin" as never] })] });
    expect(s.keys[0]!.scopes).toEqual(["chat"]);
  });
});
