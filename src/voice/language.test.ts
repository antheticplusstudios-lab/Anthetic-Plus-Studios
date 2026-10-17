import { describe, expect, it } from "vitest";
import {
  languageMetadataFrom,
  localeForLanguage,
  responseLanguageForReply,
  sentenceSegments,
} from "./language";

describe("voice language metadata", () => {
  it("recognizes Bengali script and English product names", () => {
    const result = languageMetadataFrom("আমি AntheticPlus ব্যবহার করতে চাই");
    expect(result.language).toBe("bn");
    expect(result.locale).toBe("bn-BD");
    expect(result.mixedLanguages).toContain("en");
  });

  it("recognizes Hindi written in Devanagari", () => {
    const result = languageMetadataFrom("मुझे मदद चाहिए");
    expect(result.language).toBe("hi");
    expect(result.locale).toBe("hi-IN");
  });

  it("preserves a confident transcription language hint", () => {
    const result = languageMetadataFrom("hello, can you help?", "bn-BD", 0.9);
    expect(result.language).toBe("bn");
    expect(result.confidence).toBe(0.9);
  });

  it("does not claim confident detection for a short ambiguous Latin phrase", () => {
    const result = languageMetadataFrom("hello");
    expect(result.language).toBe("en");
    expect(result.confidence).toBeLessThan(0.8);
  });

  it("normalizes regional language tags for speech providers", () => {
    expect(localeForLanguage("bn-BD")).toBe("bn-BD");
    expect(localeForLanguage("hi_IN")).toBe("hi-IN");
    expect(localeForLanguage(undefined)).toBe("en-US");
  });

  it("keeps a confident requested reply language when the reply is ambiguous", () => {
    const requested = languageMetadataFrom("বাংলায় উত্তর দাও");
    const result = responseLanguageForReply("Okay.", requested);
    expect(result.language).toBe("bn");
  });

  it("splits long replies into bounded sentence chunks", () => {
    const result = sentenceSegments("First sentence. Second sentence! Third sentence?", 20);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.length <= 20)).toBe(true);
  });

  it("returns no chunks for empty speech", () => {
    expect(sentenceSegments("  ")).toEqual([]);
  });
});
