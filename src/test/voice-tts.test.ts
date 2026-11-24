import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env["ANTHETICPLUS_DB3_MASTER_KEY"] = Buffer.alloc(32, 7).toString("base64");

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
const state = {
  settings: new Map<string, unknown>(),
  pool: [] as PoolRow[],
};

// One fake for every database client: platform_settings and automation_key_pools behave like the
// real tables for the calls these modules make; any other table reads as empty.
function from(table: string) {
  const filters: Record<string, unknown> = {};
  let upsertRow: { key: string; value: unknown } | null = null;
  let patch: Record<string, unknown> | null = null;
  let head = false;
  const run = (): Record<string, unknown> => {
    if (table === "platform_settings") {
      if (upsertRow) {
        state.settings.set(upsertRow.key, upsertRow.value);
        return { error: null };
      }
      const v = state.settings.get(String(filters["key"]));
      return { data: v === undefined ? null : { value: v }, error: null };
    }
    if (table === "automation_key_pools") {
      const hit = state.pool.filter((r) =>
        Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
      );
      if (patch) {
        for (const r of hit) Object.assign(r, patch);
        return { error: null };
      }
      return head ? { count: hit.length, error: null } : { data: hit, error: null };
    }
    return { data: null, count: 0, error: null };
  };
  const base: Record<string, unknown> = {
    select: (_c: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), q),
    eq: (c: string, v: unknown) => ((filters[c] = v), q),
    upsert: (row: { key: string; value: unknown }) => ((upsertRow = row), q),
    update: (p: Record<string, unknown>) => ((patch = p), q),
    maybeSingle: () => Promise.resolve(run()),
    single: () => Promise.resolve(run()),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(res, rej),
  };
  const q: Record<string, unknown> = new Proxy(base, {
    get: (t, p) => (p in t ? t[p as string] : () => q),
  });
  return q;
}
const fakeDb = { from };

vi.mock("@/server/db/clients.server", () => ({
  db1Admin: fakeDb,
  db2Admin: fakeDb,
  db3Admin: fakeDb,
  getDb: () => fakeDb,
}));
vi.mock("@/lib/rbac.server", () => ({
  assertAdmin: () => undefined,
  assertOwner: () => undefined,
}));
vi.mock("@/lib/platform-access.server", () => ({ auditMutation: async () => undefined }));
vi.mock("@/lib/llm-router.server", () => ({ routeChat: async () => ({}) }));
vi.mock("@/lib/orders-schema", () => ({ normalizeOrder: (x: unknown) => x, ORDER_SELECT: "*" }));

const tts = await import("@/lib/voice-tts.server");
const { InworldTtsError } = await import("@/lib/inworld-pool");
const { encryptSecret } = await import("@/server/security/envelope.server");
const agent = await import("@/lib/voice-agent.server");

const admin = { tenant: { isSuperAdmin: false } } as unknown as Parameters<
  typeof agent.saveVoiceAgentSettingsImpl
>[1];

const addKey = (secret = "cred") =>
  state.pool.push({
    id: `k${state.pool.length}`,
    scope: "website_assistant",
    provider: "inworld",
    key_ciphertext: encryptSecret(secret),
    enabled: true,
    uses: 0,
    failures: 0,
    cooldown_until: "1970-01-01T00:00:00+00:00",
  });
const mp3 = () =>
  new Response(JSON.stringify({ audioContent: Buffer.from([7, 7, 7]).toString("base64") }));
const sentBodies = (f: ReturnType<typeof vi.fn>) =>
  (f.mock.calls as unknown as Array<[string, RequestInit]>).map((c) =>
    JSON.parse(String(c[1].body)),
  );
async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const out: number[] = [];
  for (;;) {
    const n = await reader.read();
    if (n.done) break;
    out.push(...n.value);
  }
  return out;
}

beforeEach(() => {
  state.settings.clear();
  state.pool = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("provider, model and voice selection", () => {
  it("uses the saved values, trimmed, and the defaults when blank", () => {
    expect(
      tts.ttsSelectionFromSettings({ ttsModel: " inworld-tts-1.5-max ", ttsVoiceId: " Dennis " }),
    ).toEqual({
      model: "inworld-tts-1.5-max",
      voiceId: "Dennis",
    });
    expect(tts.ttsSelectionFromSettings({ ttsModel: "", ttsVoiceId: "" })).toEqual({
      model: "inworld-tts-1",
      voiceId: "Ashley",
    });
    expect(tts.ttsSelectionFromSettings({})).toEqual({ model: "inworld-tts-1", voiceId: "Ashley" });
  });

  it("is not configured (and calls nothing) when there are no Inworld keys", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await tts.getVoiceTtsConfig()).toBeNull();
    await expect(tts.streamWebsiteSpeech({ text: "Hello" })).rejects.toThrow(/not configured/);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

describe("admin panel settings reach the real Inworld request", () => {
  it("saves model and voice, then the next request uses exactly those", async () => {
    addKey("cred-1");
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);

    await agent.saveVoiceAgentSettingsImpl(
      { ttsProvider: "inworld", ttsModel: "inworld-tts-1.5-max", ttsVoiceId: "Dennis" } as never,
      admin,
    );
    expect(state.settings.get("voice_agent")).toMatchObject({
      ttsProvider: "inworld",
      ttsModel: "inworld-tts-1.5-max",
      ttsVoiceId: "Dennis",
    });

    const result = await tts.streamWebsiteSpeech({
      text: "Hello from the website.",
      language: "en",
    });
    expect(sentBodies(fetchMock)[0]).toMatchObject({
      voiceId: "Dennis",
      modelId: "inworld-tts-1.5-max",
      text: "Hello from the website.",
    });
    expect(result).toMatchObject({
      provider: "inworld",
      model: "inworld-tts-1.5-max",
      contentType: "audio/mpeg",
    });
    expect(await drain(result.stream)).toEqual([7, 7, 7]);

    // Changing the admin settings takes effect on the very next request (nothing is cached).
    await agent.saveVoiceAgentSettingsImpl(
      { ttsProvider: "inworld", ttsModel: "inworld-tts-1", ttsVoiceId: "Olivia" } as never,
      admin,
    );
    await tts.streamWebsiteSpeech({ text: "Hello again." });
    expect(sentBodies(fetchMock)[1]).toMatchObject({ voiceId: "Olivia", modelId: "inworld-tts-1" });
  });

  it("falls back to the default voice when the admin leaves the voice ID empty", async () => {
    addKey();
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal("fetch", fetchMock);
    await agent.saveVoiceAgentSettingsImpl(
      { ttsModel: "inworld-tts-1", ttsVoiceId: "" } as never,
      admin,
    );
    await tts.streamWebsiteSpeech({ text: "Hi there" });
    expect(sentBodies(fetchMock)[0]).toMatchObject({ voiceId: "Ashley" });
  });
});

describe("response reporting", () => {
  it("reports the provider and model that actually produced the audio", async () => {
    addKey();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mp3()),
    );
    const result = await tts.streamWebsiteSpeech({ text: "Hello" });
    const headers = tts.ttsResponseHeaders(result, "https://client.example");
    expect(headers["X-AP-TTS-Provider"]).toBe("inworld");
    expect(headers["X-AP-TTS-Model"]).toBe("inworld-tts-1");
    expect(headers["Content-Type"]).toBe("audio/mpeg");
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://client.example");
    expect(headers["Access-Control-Expose-Headers"]).toContain("X-AP-TTS-Provider");
    expect(tts.ttsResponseHeaders(result, null)["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("failures are explicit and safe", () => {
  it("maps rate limits and outages to honest statuses with visitor-safe text", () => {
    const limited = tts.describeTtsFailure(
      new InworldTtsError("rate_limited", "Inworld 429: secret-detail", 60),
    );
    expect(limited).toMatchObject({ status: 429, code: "rate_limited", retryAfter: 60 });
    expect(limited.message).not.toContain("secret-detail");
    expect(limited.detail).toContain("secret-detail");

    expect(
      tts.describeTtsFailure(new InworldTtsError("rejected_credentials", "Inworld 401")).status,
    ).toBe(503);
    expect(tts.describeTtsFailure(new InworldTtsError("bad_request", "Unknown voice")).status).toBe(
      502,
    );
  });

  it("never leaks unexpected error text to visitors", () => {
    const out = tts.describeTtsFailure(new Error("db password=hunter2"));
    expect(out).toMatchObject({ status: 502, code: "internal" });
    expect(out.message).not.toContain("hunter2");
  });

  it("does not use or touch browser speech when Inworld fails", async () => {
    addKey();
    const speakSpy = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak: speakSpy });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    await expect(tts.streamWebsiteSpeech({ text: "Hello" })).rejects.toMatchObject({
      code: "rejected_credentials",
    });
    expect(speakSpy).toHaveBeenCalledTimes(0);
  });

  it("stops the Inworld request when the caller cancels", async () => {
    addKey();
    const ctrl = new AbortController();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      ctrl.abort();
      if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return mp3();
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      tts.streamWebsiteSpeech({ text: "Hello", signal: ctrl.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
