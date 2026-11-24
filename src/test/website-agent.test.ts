import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for DB1 platform_settings so the real publish/rollback code
// runs end to end without touching any live database.
const rows = new Map<string, unknown>();
vi.mock("@/server/db/clients.server", () => {
  const table = () => {
    const q: Record<string, unknown> = {};
    let key = "";
    Object.assign(q, {
      select: () => q,
      eq: (_c: string, v: string) => ((key = v), q),
      maybeSingle: async () => ({
        data: rows.has(key) ? { value: rows.get(key), updated_at: "t" } : null,
        error: null,
      }),
      upsert: async (r: { key: string; value: unknown }) => (
        rows.set(r.key, structuredClone(r.value)),
        { error: null }
      ),
      delete: () => ({ eq: async (_c: string, v: string) => (rows.delete(v), { error: null }) }),
    });
    return q;
  };
  return { db1Admin: { from: table }, db3Admin: { from: table } };
});

const pub = await import("@/assistant/sites/site-publishing.server");
const cfg = await import("@/assistant/sites/site-config.server");
const ctx = await import("@/assistant/sites/site-context.server");
const pure = await import("@/assistant/sites/site-publishing");

beforeEach(() => rows.clear());

describe("draft vs published", () => {
  it("saving a draft does not change what visitors get", async () => {
    const before = await cfg.loadSiteConfig("antheticplus");
    await pub.saveDraft("antheticplus", { welcomeMessage: "Draft hello" }, "admin");
    expect((await cfg.loadSiteConfig("antheticplus")).welcomeMessage).toBe(before.welcomeMessage);
    const a = await pub.loadAgent("antheticplus");
    expect(a.state).toBe("draft");
    expect(a.changed).toEqual(["welcomeMessage"]);
  });

  it("publish makes the draft live, creates v1 and clears the draft; survives reload", async () => {
    await pub.saveDraft("antheticplus", { welcomeMessage: "Hello v1" }, "admin");
    const v = await pub.publishDraft("antheticplus", "admin", "first");
    expect(v.version).toBe(1);
    expect((await cfg.loadSiteConfig("antheticplus")).welcomeMessage).toBe("Hello v1");
    const a = await pub.loadAgent("antheticplus");
    expect(a.state).toBe("published");
    expect(a.draft).toBeNull();
  });

  it("rollback republishes an older version as a new version", async () => {
    await pub.saveDraft("antheticplus", { welcomeMessage: "A" }, "admin");
    await pub.publishDraft("antheticplus", "admin", "");
    await pub.saveDraft("antheticplus", { welcomeMessage: "B" }, "admin");
    await pub.publishDraft("antheticplus", "admin", "");
    const r = await pub.rollbackTo("antheticplus", 1, "admin");
    expect(r.version).toBe(3);
    expect(r.rolledBackFrom).toBe(1);
    expect((await cfg.loadSiteConfig("antheticplus")).welcomeMessage).toBe("A");
  });

  it("rollback never restores old knowledge approval state", async () => {
    await pub.saveDraft("antheticplus", { tone: "x" }, "admin");
    await pub.publishDraft("antheticplus", "admin", "");
    const c = await cfg.loadSiteConfig("antheticplus");
    await cfg.saveSiteConfig("antheticplus", {
      ...c,
      knowledge: [
        {
          id: "k",
          title: "t",
          content: "c",
          kind: "manual",
          category: "faq",
          status: "disabled",
          sourceId: null,
          updatedAt: "",
        },
      ],
    });
    await pub.saveDraft("antheticplus", { tone: "y" }, "admin");
    await pub.publishDraft("antheticplus", "admin", "");
    await pub.rollbackTo("antheticplus", 1, "admin");
    expect((await cfg.loadSiteConfig("antheticplus")).knowledge[0]!.status).toBe("disabled");
  });
});

describe("NY Partners safety", () => {
  it("cannot be published as switched on without a verified domain, business info and contact", async () => {
    await pub.saveDraft("ny-partners", { enabled: true }, "admin");
    await expect(pub.publishDraft("ny-partners", "admin", "")).rejects.toThrow(
      /verified website domain/,
    );
    expect((await cfg.loadSiteConfig("ny-partners")).enabled).toBe(false);
    expect((await pub.loadAgent("ny-partners")).state).toBe("failed");
  });

  it("an unverified domain is not allowed to load the widget", async () => {
    await pub.requestDomain("ny-partners", "nypartners.example");
    const c = await cfg.loadSiteConfig("ny-partners");
    await cfg.saveSiteConfig("ny-partners", {
      ...c,
      enabled: true,
      extraDomains: ["nypartners.example"],
    });
    const r = await ctx.resolveSiteForOrigin(
      "ny-partners",
      "https://nypartners.example",
      "app.test",
    );
    expect(r.ok).toBe(false);
  });

  it("a verified domain is allowed, and only for its own site", async () => {
    const d = await pub.requestDomain("ny-partners", "nypartners.example");
    rows.set("web_assistant_domains:ny-partners", { domains: [{ ...d, verifiedAt: "now" }] });
    expect(
      (await ctx.resolveSiteForOrigin("ny-partners", "https://nypartners.example", "app.test")).ok,
    ).toBe(true);
    expect(
      (await ctx.resolveSiteForOrigin("antheticplus", "https://nypartners.example", "app.test")).ok,
    ).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("drafts, versions and domains of one site never affect the other", async () => {
    await pub.saveDraft("ny-partners", { displayName: "NY draft" }, "admin");
    await pub.requestDomain("ny-partners", "ny.example");
    const ap = await pub.loadAgent("antheticplus");
    expect(ap.draft).toBeNull();
    expect(ap.domains.domains).toEqual([]);
    expect(ap.working.displayName).not.toBe("NY draft");
  });

  it("partner sites can never get first-party account tools, even via a draft", async () => {
    await pub.saveDraft(
      "ny-partners",
      { allowedTools: ["search_site_knowledge", "get_subscription"] },
      "admin",
    );
    expect((await pub.loadAgent("ny-partners")).working.allowedTools).toEqual([
      "search_site_knowledge",
    ]);
  });
});

describe("knowledge approval and channel settings", () => {
  it("only explicit approve marks knowledge approved", () => {
    expect(pure.reviewStatus("approve")).toBe("approved");
    expect(pure.reviewStatus("reject")).toBe("disabled");
  });
  it("chat and voice channel fields are distinct and all are versioned", () => {
    const all = [
      ...pure.CHANNEL_FIELDS.shared,
      ...pure.CHANNEL_FIELDS.chat,
      ...pure.CHANNEL_FIELDS.voice,
    ];
    expect(new Set(all).size).toBe(all.length);
    for (const f of all) expect(pure.SETTINGS_FIELDS).toContain(f);
  });
});

describe("installation keys on the public endpoints", () => {
  const http = () => import("@/assistant/sites/site-http.server");
  const keys = () => import("@/lib/site-keys.server");
  const req = (h: Record<string, string>) =>
    new Request("https://app.test/api/public/assistant/chat", { headers: h });

  it("server key works for its scope only, and only for its own site", async () => {
    const c = await cfg.loadSiteConfig("antheticplus");
    await cfg.saveSiteConfig("antheticplus", c);
    const { secret } = await (
      await keys()
    ).createKey("antheticplus", { label: "s", kind: "secret", scopes: ["chat"] }, "a");
    const { resolveFromRequest } = await http();
    expect(
      (await resolveFromRequest(req({ authorization: `Bearer ${secret}` }), "antheticplus", "chat"))
        .ok,
    ).toBe(true);
    expect(
      (
        await resolveFromRequest(
          req({ authorization: `Bearer ${secret}` }),
          "antheticplus",
          "voice",
        )
      ).ok,
    ).toBe(false);
    expect(
      (await resolveFromRequest(req({ authorization: `Bearer ${secret}` }), "ny-partners", "chat"))
        .ok,
    ).toBe(false);
  });

  it("when a website key is required, widget calls without one are refused", async () => {
    const k = await keys();
    const { secret } = await k.createKey(
      "antheticplus",
      { label: "w", kind: "publishable", scopes: ["chat"] },
      "a",
    );
    const store = await k.loadKeyStore("antheticplus");
    await k.saveKeyStore("antheticplus", { ...store, requireEmbedKey: true });
    const { resolveFromRequest } = await http();
    expect(
      (await resolveFromRequest(req({ origin: "https://app.test" }), "antheticplus", "chat")).ok,
    ).toBe(false);
    expect(
      (
        await resolveFromRequest(
          req({ origin: "https://app.test", "x-site-key": secret }),
          "antheticplus",
          "chat",
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await resolveFromRequest(
          req({ origin: "https://evil.example", "x-site-key": secret }),
          "antheticplus",
          "chat",
        )
      ).ok,
    ).toBe(false);
  });

  it("revoked keys stop working immediately", async () => {
    const k = await keys();
    const { record, secret } = await k.createKey(
      "antheticplus",
      { label: "s", kind: "secret", scopes: ["chat"] },
      "a",
    );
    await k.revokeKey("antheticplus", record.id, "test");
    const { resolveFromRequest } = await http();
    expect(
      (await resolveFromRequest(req({ authorization: `Bearer ${secret}` }), "antheticplus", "chat"))
        .ok,
    ).toBe(false);
  });
});
