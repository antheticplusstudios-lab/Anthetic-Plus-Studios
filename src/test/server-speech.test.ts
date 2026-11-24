import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerSpeechInfo } from "@/voice/server-speech";

const speech = await import("@/voice/server-speech");

class FakeAudio {
  static instances: FakeAudio[] = [];
  static playError: Error | null = null;
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  played = 0;
  constructor() {
    FakeAudio.instances.push(this);
  }
  play() {
    if (FakeAudio.playError) return Promise.reject(FakeAudio.playError);
    this.played += 1;
    return Promise.resolve();
  }
  pause() {}
  load() {}
  removeAttribute() {
    this.src = "";
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const audioResponse = (headers: Record<string, string> = {}) =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "x-ap-tts-provider": "inworld",
      "x-ap-tts-model": "inworld-tts-1",
      ...headers,
    },
  });
const jsonError = (status: number, message?: string) =>
  new Response(message ? JSON.stringify({ ok: false, error: { code: "x", message } }) : "nope", {
    status,
    headers: { "content-type": message ? "application/json" : "text/plain" },
  });

const makeCallbacks = () => ({
  onStart: vi.fn((_info: ServerSpeechInfo) => {}),
  onEnd: vi.fn(() => {}),
  onError: vi.fn((_message: string) => {}),
});

let browserSpeak: ReturnType<typeof vi.fn>;
let cb: ReturnType<typeof makeCallbacks>;

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.playError = null;
  browserSpeak = vi.fn();
  cb = makeCallbacks();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("speechSynthesis", { speak: browserSpeak, cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} }),
  );
});
afterEach(() => {
  speech.stopServerSpeech();
  vi.unstubAllGlobals();
});

describe("server speech (Inworld via the TTS route)", () => {
  it("requests the first-party site's audio and plays it, reporting the provider", async () => {
    const fetchMock = vi.fn(async () => audioResponse());
    vi.stubGlobal("fetch", fetchMock);
    speech.speakServer("Hello there", { ...cb, lang: "en-US" });
    await flush();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/public/assistant/tts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      site: "antheticplus",
      text: "Hello there",
      language: "en-US",
    });
    const audio = FakeAudio.instances.at(-1)!;
    expect(audio.played).toBe(1);
    expect(cb.onStart).toHaveBeenCalledWith({ provider: "inworld", model: "inworld-tts-1" });

    audio.onended?.();
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledTimes(0);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("omits the language when none is known so the server can detect it", async () => {
    const fetchMock = vi.fn(async () => audioResponse());
    vi.stubGlobal("fetch", fetchMock);
    speech.speakServer("Hello", cb);
    await flush();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("language");
  });

  it("shows the server's safe message on failure and never uses browser speech", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonError(503, "Voice is temporarily unavailable.")),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError).toHaveBeenCalledWith("Voice is temporarily unavailable.");
    expect(cb.onStart).toHaveBeenCalledTimes(0);
    expect(cb.onEnd).toHaveBeenCalledTimes(0);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("explains rate limiting even when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonError(429)),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError.mock.calls[0]?.[0]).toMatch(/rate-limited/);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("rejects a response that is not audio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
      ),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances.every((a) => a.played === 0)).toBe(true);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("rejects an empty audio body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(new Uint8Array(), { headers: { "content-type": "audio/mpeg" } }),
      ),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError.mock.calls[0]?.[0]).toMatch(/no audio/);
  });

  it("reports a network failure without falling back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("tells the user when the browser blocks audio playback", async () => {
    FakeAudio.playError = new DOMException("blocked", "NotAllowedError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => audioResponse()),
    );
    speech.speakServer("Hello", cb);
    await flush();
    expect(cb.onError.mock.calls[0]?.[0]).toMatch(/blocked audio/);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });

  it("cancels the in-flight request and stays silent when stopped", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            signal = init.signal ?? undefined;
            init.signal?.addEventListener("abort", () =>
              rej(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    speech.speakServer("Hello", cb);
    await flush();
    speech.stopServerSpeech();
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(cb.onError).toHaveBeenCalledTimes(0);
    expect(cb.onEnd).toHaveBeenCalledTimes(0);
    expect(cb.onStart).toHaveBeenCalledTimes(0);
  });

  it("a newer reply supersedes an older one", async () => {
    const fetchMock = vi.fn(async () => audioResponse());
    vi.stubGlobal("fetch", fetchMock);
    const first = makeCallbacks();
    speech.speakServer("First", first);
    speech.speakServer("Second", cb);
    await flush();
    expect(first.onStart).toHaveBeenCalledTimes(0);
    expect(cb.onStart).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported browsers instead of switching voices", () => {
    vi.stubGlobal("Audio", undefined);
    expect(speech.isServerSpeechSupported()).toBe(false);
    speech.speakServer("Hello", cb);
    expect(cb.onError.mock.calls[0]?.[0]).toMatch(/aren't supported/);
    expect(browserSpeak).toHaveBeenCalledTimes(0);
  });
});
