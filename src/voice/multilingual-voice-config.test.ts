import { describe, expect, it } from "vitest";
import {
  DEFAULT_MULTILINGUAL_VOICE_CONFIG,
  buildVoiceVocabularyHint,
  getEnabledLanguageTags,
  normalizeMultilingualVoiceConfig,
} from "./multilingual-voice-config";

describe("multilingual voice configuration", () => {
  it("provides English, Bangla, and Hindi defaults with code-switching enabled", () => {
    expect(getEnabledLanguageTags(DEFAULT_MULTILINGUAL_VOICE_CONFIG)).toEqual([
      "en-US",
      "bn-BD",
      "hi-IN",
    ]);
    expect(DEFAULT_MULTILINGUAL_VOICE_CONFIG.allowCodeSwitching).toBe(true);
  });

  it("normalizes untrusted persisted values and drops duplicate or invalid language tags", () => {
    const config = normalizeMultilingualVoiceConfig({
      detectionMode: "preferred",
      enabledLanguages: [
        { tag: "bn-BD", label: "Bangla", enabled: true, priority: 2 },
        { tag: "BN-bd", label: "duplicate", enabled: true, priority: 100 },
        { tag: "not a tag", label: "bad", enabled: true, priority: 10 },
        { tag: "en-US", label: "", enabled: false, priority: 2000 },
      ],
      allowCodeSwitching: false,
      vocabulary: [" AntheticPlus ", "AntheticPlus", "", 12],
    });

    expect(config.detectionMode).toBe("preferred");
    expect(config.enabledLanguages).toEqual([
      { tag: "en-US", label: "en-US", enabled: false, priority: 1000 },
      { tag: "bn-BD", label: "Bangla", enabled: true, priority: 2 },
    ]);
    expect(config.allowCodeSwitching).toBe(false);
    expect(config.vocabulary).toEqual(["AntheticPlus"]);
  });

  it("excludes disabled languages and exposes vocabulary hints", () => {
    const config = normalizeMultilingualVoiceConfig({
      enabledLanguages: [
        { tag: "en-US", enabled: true, priority: 10 },
        { tag: "bn-BD", enabled: false, priority: 9 },
      ],
      vocabulary: ["AntheticPlus"],
    });

    expect(getEnabledLanguageTags(config)).toEqual(["en-US"]);
    expect(buildVoiceVocabularyHint(config)).toBe("AntheticPlus");
  });

  it("falls back safely for malformed persisted values", () => {
    expect(normalizeMultilingualVoiceConfig(null)).toEqual(DEFAULT_MULTILINGUAL_VOICE_CONFIG);
  });
});
