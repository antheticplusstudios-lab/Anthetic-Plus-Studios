import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type KeyRow = {
  id: string;
  provider_key: string;
  label: string;
  key_ciphertext: string;
  model: string | null;
  cooldown_until: string | null;
  request_count: number;
  error_count: number;
  priority: number;
  is_active: boolean;
};
const state = {
  keys: [] as KeyRow[],
  logs: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
};

function fakeFrom(table: string) {
  let patch: Record<string, unknown> | null = null;
  let inserted: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (key: string, value: unknown) => ((filters[key] = value), q),
    order: () => q,
    update: (value: Record<string, unknown>) => ((patch = value), q),
    insert: (value: Record<string, unknown>) => {
      inserted = value;
      return q;
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      try {
        if (patch) {
          state.updates.push(patch);
          for (const row of state.keys) {
            if (!filters["id"] || row.id === filters["id"]) Object.assign(row, patch);
          }
        }
        if (inserted) state.logs.push(inserted);
        const data =
          table === "llm_api_keys"
            ? state.keys.filter((row) =>
                Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
              )
            : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    },
  });
  return q;
}

vi.mock("@/server/db/clients.server", () => ({ db3Admin: { from: fakeFrom } }));
vi.mock("@/server/security/envelope.server", () => ({ decryptSecret: () => "test-provider-secret" }));
vi.mock("@/lib/provider-pool", () => ({
  orderKeys: (keys: KeyRow[]) => keys,
  modelFor: () => null,
}));

const router = await import("@/lib/llm-router.server");

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function addKey(provider = "groq") {
  state.keys.push({
    id: "key-1",
    provider_key: provider,
    label: "Homepage Voice Agent",
    key_ciphertext: "ciphertext",
    model: null,
    cooldown_until: null,
    request_count: 0,
    error_count: 0,
    priority: 0,
    is_active: true,
  });
}

beforeEach(() => {
  state.keys = [];
  state.logs = [];
  state.updates = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("LLM provider streaming", () => {
  it("parses OpenAI-compatible SSE deltas and logs a successful request", async () => {
    addKey("groq");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"world."}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];

    const result = await router.routeChatStream(
      [{ role: "user", content: "Say hello." }],
      { keyLabel: "Homepage Voice Agent" },
      (delta) => deltas.push(delta),
    );

    expect(result?.reply).toBe("Hello world.");
    expect(deltas).toEqual(["Hello ", "world."]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    expect(JSON.parse(String(init?.body)).stream).toBe(true);
    expect(state.logs.at(-1)).toMatchObject({ provider_key: "groq", status: "success" });
  });

  it("parses Anthropic text_delta events", async () => {
    addKey("anthropic");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":0}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour."}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    const result = await router.routeChatStream(
      [{ role: "system", content: "Answer plainly." }, { role: "user", content: "Salut." }],
      {},
      (delta) => deltas.push(delta),
    );

    expect(result).toMatchObject({ reply: "Bonjour.", tokensIn: 12, tokensOut: 3 });
    expect(deltas).toEqual(["Bonjour."]);
  });

  it("does not fail over to a second model after some text has already streamed", async () => {
    addKey("groq");
    state.keys.push({ ...state.keys[0]!, id: "key-2", provider_key: "openai", priority: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
          'data: {"error":{"message":"connection broke"}}\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    await expect(
      router.routeChatStream([{ role: "user", content: "Hi" }], {}, (delta) => deltas.push(delta)),
    ).rejects.toThrow(/connection broke/);
    expect(deltas).toEqual(["partial"]);
    expect(state.logs.at(-1)).toMatchObject({ status: "error" });
  });
});
