import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env["ANTHETICPLUS_DB3_MASTER_KEY"] = Buffer.alloc(32, 7).toString("base64");

// In-memory stand-in for DB2 automation_key_pools. No live database is touched.
type PoolRow = {
  id: string;
  scope: string;
  provider: string;
  key_ciphertext: string;
  enabled: boolean;
  uses: number;
  failures: number;
  cooldown_until: string;
};
const pool = {
  rows: [] as PoolRow[],
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  error: null as string | null,
};

vi.mock("@/server/db/clients.server", () => ({
  getDb: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      let head = false;
      const run = () => {
        if (pool.error) return { data: null, count: null, error: { message: pool.error } };
        const hit = pool.rows.filter((r) =>
          Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
        );
        if (patch) {
          for (const r of hit) {
            Object.assign(r, patch);
            pool.updates.push({ id: r.id, patch: { ...patch } });
          }
          return { error: null };
        }
        return head ? { count: hit.length, error: null } : { data: hit, error: null };
      };
      const q: Record<string, unknown> = {
        select: (_c: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        update: (p: Record<string, unknown>) => ((patch = p), q),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  }),
}));

const pure = await import("@/lib/inworld-pool");
const { encryptSecret } = await import("@/server/security/envelope.server");
const { inworldSpeak, inworldKeyCount } = await import("@/lib/inworld-tts.server");

const addKey = (id: string, secret: string, extra: Partial<PoolRow> = {}) =>
  pool.rows.push({
    id,
    scope: "website_assistant",
    provider: "inworld",
    key_ciphertext: encryptSecret(secret),
    enabled: true,
    uses: 0,
    failures: 0,
    cooldown_until: "1970-01-01T00:00:00+00:00",
    ...extra,
  });

const audioResponse = (bytes: number[]) =>
  new Response(JSON.stringify({ audioContent: Buffer.from(bytes).toString("base64") }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const errorResponse = (status: number, body = "{}", headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

const speak = (over: Partial<Parameters<typeof inworldSpeak>[0]> = {}) =>
  inworldSpeak({
    scope: "website_assistant",
    text: "Hello there.",
    voiceId: "Dennis",
    model: "inworld-tts-1.5-max",
    ...over,
  });

beforeEach(() => {
  pool.rows = [];
  pool.updates = [];
  pool.error = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("Inworld request contract", () => {
  it("posts to the TTS endpoint with Basic auth, voice, model and MP3 encoding", () => {
    const req = pure.inworldRequest("Hi", "Dennis", "inworld-tts-1.5-max", "BASE64CRED");
    expect(req.url).toBe("https://api.inworld.ai/tts/v1/voice");
    expect(req.init.method).toBe("POST");
    expect(req.init.headers["Authorization"]).toBe("Basic BASE64CRED");
    expect(JSON.parse(req.init.body)).toEqual({
      text: "Hi",
      voiceId: "Dennis",
      modelId: "inworld-tts-1.5-max",
      audioConfig: { audioEncoding: "MP3" },
    });
  });

  it("falls back to the default voice and model only when none are given", () => {
    const body = JSON.parse(pure.inworldRequest("Hi", "", "", "k").init.body);
    expect(body.voiceId).toBe("Ashley");
    expect(body.modelId).toBe("inworld-tts-1");
  });

  it("classifies provider responses for key rotation", () => {
    expect(pure.inworldOutcome(429, "slow down", "30")).toMatchObject({
      kind: "limit",
      retryAfterMs: 30_000,
    });
    expect(pure.inworldOutcome(401, "no")).toMatchObject({ kind: "auth" });
    expect(pure.inworldOutcome(400, "Unknown voice")).toMatchObject({ kind: "fatal" });
    expect(pure.inworldOutcome(503, "down")).toMatchObject({ kind: "transient" });
  });
});

describe("text chunking for Inworld's 2,000 character limit", () => {
  it("leaves short text alone", () => {
    expect(pure.splitForInworld("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits long text under the limit without losing words", () => {
    const text = "This is a sentence about automation. ".repeat(200).trim();
    const parts = pure.splitForInworld(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(1900);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("hard-splits a single sentence that is longer than the limit", () => {
    const parts = pure.splitForInworld("word ".repeat(1200));
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(1900);
    expect(parts.length).toBeGreaterThan(2);
  });
});

describe("inworldSpeak", () => {
  it("sends the configured voice and model and returns the decoded audio", async () => {
    addKey("a", "cred-a");
    const fetchMock = vi.fn(async () => audioResponse([1, 2, 3]));
    vi.stubGlobal("fetch", fetchMock);
    const audio = await speak();
    expect(Array.from(audio)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.inworld.ai/tts/v1/voice");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Basic cred-a");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ voiceId: "Dennis", modelId: "inworld-tts-1.5-max" });
    expect(pool.updates).toEqual([{ id: "a", patch: expect.objectContaining({ uses: 1 }) }]);
  });

  it("reports missing credentials instead of falling back", async () => {
    await expect(speak()).rejects.toMatchObject({
      name: "InworldTtsError",
      code: "not_configured",
    });
    addKey("off", "cred", { enabled: false });
    await expect(speak()).rejects.toMatchObject({ code: "not_configured" });
  });

  it("treats undecryptable keys as a server problem and never rests them in the pool", async () => {
    addKey("bad", "x", { key_ciphertext: "not-a-valid-ciphertext" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(speak()).rejects.toMatchObject({ code: "keys_unreadable", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(pool.updates).toEqual([]);
  });

  it("surfaces invalid credentials (401) as a safe 503 and rests the key", async () => {
    addKey("a", "wrong");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse(401, "Unauthorized")),
    );
    const err = await speak().catch((e) => e);
    expect(err).toMatchObject({ code: "rejected_credentials", status: 503 });
    expect(err.publicMessage).not.toContain("wrong");
    expect(err.message).not.toContain("wrong");
    expect(pool.updates[0]?.patch["failures"]).toBe(1);
  });

  it("rotates to the next key when one is rate limited", async () => {
    addKey("a", "key-a", { uses: 0 });
    addKey("b", "key-b", { uses: 5 });
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) =>
      (init.headers as Record<string, string>)["Authorization"] === "Basic key-a"
        ? errorResponse(429, "limit")
        : audioResponse([9]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const audio = await speak();
    expect(Array.from(audio)).toEqual([9]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const a = pool.rows.find((r) => r.id === "a")!;
    const b = pool.rows.find((r) => r.id === "b")!;
    expect(a.failures).toBe(1);
    expect(new Date(a.cooldown_until).getTime()).toBeGreaterThan(Date.now());
    expect(b.uses).toBe(6);
  });

  it("returns a 429 failure with a retry hint when every key is rate limited", async () => {
    addKey("a", "key-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => errorResponse(429, "limit", { "retry-after": "20" })),
    );
    await expect(speak()).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("explains when all keys are resting from earlier failures", async () => {
    addKey("a", "key-a", { cooldown_until: new Date(Date.now() + 120_000).toISOString() });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(speak()).rejects.toMatchObject({ code: "keys_resting", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("reports an unknown voice or model (400) without retrying other keys", async () => {
    addKey("a", "key-a");
    addKey("b", "key-b");
    const fetchMock = vi.fn(async () => errorResponse(400, "Unknown voice: Nope not found!"));
    vi.stubGlobal("fetch", fetchMock);
    const err = await speak({ voiceId: "Nope" }).catch((e) => e);
    expect(err).toMatchObject({ code: "bad_request", status: 502 });
    expect(err.message).toContain("Unknown voice");
    expect(err.publicMessage).not.toContain("Unknown voice");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an empty or malformed audio payload as an upstream failure", async () => {
    addKey("a", "key-a");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ audioContent: "" }))),
    );
    await expect(speak()).rejects.toMatchObject({ code: "upstream_unavailable" });
    pool.rows[0]!.cooldown_until = "1970-01-01T00:00:00+00:00"; // the first failure rested the key
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>oops</html>")),
    );
    await expect(speak()).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("splits text over 2,000 characters into several requests and joins the audio", async () => {
    addKey("a", "key-a");
    let n = 0;
    const fetchMock = vi.fn(async () => audioResponse([++n]));
    vi.stubGlobal("fetch", fetchMock);
    const audio = await speak({ text: "Plenty of words to say here. ".repeat(180) });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    for (const call of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(JSON.parse(String(call[1].body)).text.length).toBeLessThanOrEqual(2000);
    }
    expect(audio.length).toBe(fetchMock.mock.calls.length);
  });

  it("passes the cancellation signal to Inworld and does not penalise the key", async () => {
    addKey("a", "key-a");
    const ctrl = new AbortController();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      ctrl.abort();
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return audioResponse([1]);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(speak({ signal: ctrl.signal })).rejects.toMatchObject({ name: "AbortError" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBe(ctrl.signal);
    expect(pool.updates).toEqual([]);
  });
});

describe("inworldKeyCount", () => {
  it("counts enabled keys for the scope", async () => {
    addKey("a", "k1");
    addKey("b", "k2", { enabled: false });
    expect(await inworldKeyCount("website_assistant")).toBe(1);
  });

  it("throws on a database error instead of reporting zero keys", async () => {
    pool.error = "connection refused";
    await expect(inworldKeyCount("website_assistant")).rejects.toThrow(/connection refused/);
  });
});
