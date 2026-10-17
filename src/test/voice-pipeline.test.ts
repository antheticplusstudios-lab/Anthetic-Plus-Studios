import { describe, expect, it } from "vitest";
import { BARGE_CONFIG, LISTEN_CONFIG, VadDetector, type VadEvent } from "@/voice/vad";
import { cleanTranscript, audioFileName } from "@/voice/transcript-filter";
import { frameLength, joinMp3, stripMp3 } from "@/lib/mp3-join";

function run(vad: VadDetector, frames: Array<[number, number]>, start = 0, step = 20) {
  const events: VadEvent[] = [];
  let t = start;
  for (const [rms, band] of frames) {
    t += step;
    const ev = vad.process(rms, band, t);
    if (ev) events.push(ev);
  }
  return { events, t };
}
const repeat = (n: number, f: [number, number]) => Array.from({ length: n }, () => f);

describe("adaptive VAD", () => {
  it("detects quiet speech above a quiet room", () => {
    const vad = new VadDetector(LISTEN_CONFIG, 0);
    const { events } = run(vad, [...repeat(30, [0.002, 0.2]), ...repeat(20, [0.012, 0.7])]);
    expect(events.map((e) => e.type)).toContain("speech_start");
  });

  it("ignores steady background noise that is not in the speech band", () => {
    const vad = new VadDetector(LISTEN_CONFIG, 0);
    const { events } = run(vad, repeat(200, [0.05, 0.1]));
    expect(events.some((e) => e.type === "speech_start")).toBe(false);
  });

  it("does not end the utterance on a natural 700ms pause", () => {
    const vad = new VadDetector(LISTEN_CONFIG, 0);
    const { events } = run(vad, [
      ...repeat(20, [0.002, 0.2]),
      ...repeat(40, [0.03, 0.7]),
      ...repeat(35, [0.002, 0.2]), // 700ms pause
      ...repeat(40, [0.03, 0.7]),
    ]);
    expect(events.filter((e) => e.type === "speech_end")).toHaveLength(0);
  });

  it("ends the utterance after a long silence", () => {
    const vad = new VadDetector(LISTEN_CONFIG, 0);
    const { events } = run(vad, [
      ...repeat(20, [0.002, 0.2]),
      ...repeat(40, [0.03, 0.7]),
      ...repeat(100, [0.002, 0.2]),
    ]);
    expect(events.some((e) => e.type === "speech_end")).toBe(true);
  });

  it("barge-in ignores a short echo burst at playback start and steady echo", () => {
    const vad = new VadDetector(BARGE_CONFIG, 0);
    const { events } = run(vad, [
      ...repeat(30, [0.04, 0.8]), // grace: learns echo floor
      ...repeat(150, [0.045, 0.8]), // residual echo at the same level
    ]);
    expect(events.some((e) => e.type === "speech_start")).toBe(false);
  });

  it("barge-in fires on sustained speech well above the echo floor", () => {
    const vad = new VadDetector(BARGE_CONFIG, 0);
    const { events } = run(vad, [...repeat(35, [0.01, 0.8]), ...repeat(25, [0.12, 0.8])]);
    expect(events.some((e) => e.type === "speech_start")).toBe(true);
  });
});

describe("transcript filter", () => {
  it("drops Whisper's silence hallucination", () => {
    expect(
      cleanTranscript("Thank you.", [
        { text: "Thank you.", no_speech_prob: 0.8, avg_logprob: -0.9 },
      ]),
    ).toBe("");
  });
  it("keeps a real short answer", () => {
    expect(
      cleanTranscript("Thank you.", [
        { text: "Thank you.", no_speech_prob: 0.05, avg_logprob: -0.2 },
      ]),
    ).toBe("Thank you.");
  });
  it("names iOS recordings with an m4a extension", () => {
    expect(audioFileName("audio/mp4")).toBe("voice.m4a");
    expect(audioFileName("audio/webm;codecs=opus")).toBe("voice.webm");
  });
});

function fakeMp3(withInfo: boolean, frames: number) {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: 417 bytes per frame.
  const header = [0xff, 0xfb, 0x90, 0x00];
  const id3 = [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4];
  const frame = (info: boolean) => {
    const f = new Uint8Array(417);
    f.set(header);
    if (info) f.set([0x58, 0x69, 0x6e, 0x67], 36);
    return Array.from(f);
  };
  const bytes = [...id3];
  if (withInfo) bytes.push(...frame(true));
  for (let i = 0; i < frames; i++) bytes.push(...frame(false));
  return new Uint8Array(bytes);
}

describe("mp3 join", () => {
  it("reads frame length", () => {
    expect(frameLength(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), 0)).toBe(417);
  });
  it("strips ID3 and Xing so only audio frames remain", () => {
    expect(stripMp3(fakeMp3(true, 3)).byteLength).toBe(417 * 3);
  });
  it("joins pieces without per-piece headers", () => {
    expect(joinMp3([fakeMp3(true, 2), fakeMp3(true, 5)]).byteLength).toBe(417 * 7);
  });
});
