import { describe, expect, it } from "vitest";
import { languageMetadataFrom } from "./language";

describe("voice language metadata", () => {
  it("recognizes Bengali script without relying on a browser locale", () => {
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

  it("defaults short ambiguous Latin text to English instead of overclaiming detection", () => {
    const result = languageMetadataFrom("hello");
    expect(result.language).toBe("en");
    expect(result.confidence).toBeLessThan(0.8);
  });
});
