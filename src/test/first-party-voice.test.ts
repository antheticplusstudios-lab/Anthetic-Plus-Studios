import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for DB1 platform_settings (same approach as website-agent.test.ts).
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

const http = await import("@/assistant/sites/site-http.server");
const keys = await import("@/lib/site-keys.server");

const req = (headers: Record<string, string>) =>
  new Request("https://app.test/api/public/assistant/tts", { method: "POST", headers });

beforeEach(() => rows.clear());

describe("first-party voice agent vs. the embed-key requirement", () => {
  async function requireKey() {
    const store = await keys.loadKeyStore("antheticplus");
    await keys.saveKeyStore("antheticplus", { ...store, requireEmbedKey: true });
  }

  it("lets the app's own pages use voice even when widget embed keys are required", async () => {
    await requireKey();
    const res = await http.resolveFirstPartyOrRequest(
      req({ origin: "https://app.test" }),
      "antheticplus",
      "voice",
    );
    expect(res.ok).toBe(true);
    // ...whereas the unmodified widget rule still refuses the same request.
    expect(
      (await http.resolveFromRequest(req({ origin: "https://app.test" }), "antheticplus", "voice"))
        .ok,
    ).toBe(false);
  });

  it("still refuses other origins when a key is required", async () => {
    await requireKey();
    const res = await http.resolveFirstPartyOrRequest(
      req({ origin: "https://evil.example" }),
      "antheticplus",
      "voice",
    );
    expect(res.ok).toBe(false);
  });

  it("does not let a page on the app host claim a non-first-party site", async () => {
    const res = await http.resolveFirstPartyOrRequest(
      req({ origin: "https://app.test" }),
      "ny-partners",
      "voice",
    );
    expect(res.ok).toBe(false);
  });

  it("rejects unknown site ids and requests without an origin", async () => {
    expect(
      (await http.resolveFirstPartyOrRequest(req({ origin: "https://app.test" }), "nope", "voice"))
        .ok,
    ).toBe(false);
    await requireKey();
    expect((await http.resolveFirstPartyOrRequest(req({}), "antheticplus", "voice")).ok).toBe(
      false,
    );
  });

  it("sends Bearer-key requests through the normal key checks", async () => {
    const res = await http.resolveFirstPartyOrRequest(
      req({ origin: "https://app.test", authorization: "Bearer ap_sk_not-a-real-key" }),
      "antheticplus",
      "voice",
    );
    expect(res.ok).toBe(false);
  });
});
