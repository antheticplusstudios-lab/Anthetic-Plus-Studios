import { describe, expect, it } from "vitest";
import { splitSpeechIntoChunks } from "@/voice/server-speech-queue";

describe("sentence-aware speech chunking", () => {
  it("groups short sentences together to avoid one request per sentence", () => {
    expect(splitSpeechIntoChunks("Hello there. How are you? I am doing well.")).toEqual([
      "Hello there. How are you? I am doing well.",
    ]);
  });

  it("splits long replies into bounded chunks without losing words", () => {
    const input = Array.from({ length: 18 }, (_, i) => `Sentence number ${i + 1} has a little bit of text.`).join(" ");
    const chunks = splitSpeechIntoChunks(input);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 320)).toBe(true);
    expect(chunks.join(" ")).toBe(input);
  });

  it("recognizes Bengali and CJK sentence punctuation", () => {
    expect(splitSpeechIntoChunks("আপনি কেমন আছেন? আমি ভালো আছি। 你好！")).toEqual([
      "আপনি কেমন আছেন? আমি ভালো আছি। 你好！",
    ]);
  });

  it("strips markdown links and URLs before sending speech text", () => {
    expect(splitSpeechIntoChunks("Read [the docs](https://example.com) at https://example.com now.")).toEqual([
      "Read the docs at now.",
    ]);
  });

  it("returns no chunks for blank input", () => {
    expect(splitSpeechIntoChunks("   ")).toEqual([]);
  });
});
