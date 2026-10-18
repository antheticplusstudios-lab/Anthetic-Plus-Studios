/**
 * Shared multilingual voice configuration helpers.
 *
 * These are deliberately provider-neutral: a configured language is a preference,
 * not a promise that every speech provider can recognize/synthesize it. Keep tenant
 * authorization in the server functions that load/save the containing configuration.
 */
export type VoiceLanguage = {
  /** BCP-47 language tag, e.g. "bn-BD", "en-US". */
  tag: string;
  /** Admin-facing label, e.g. "Bangla (Bangladesh)". */
  label: string;
  enabled: boolean;
  /** Higher values are preferred when a provider needs a primary locale. */
  priority: number;
};

export type MultilingualVoiceConfig = {
  /** Empty means provider auto-detection, constrained by enabledLanguages. */
  detectionMode: "auto" | "preferred";
  enabledLanguages: VoiceLanguage[];
  /** Preserve language mixing in one utterance when provider supports it. */
  allowCodeSwitching: boolean;
  /** Domain terms used to bias transcription correction, not to replace audio evidence. */
  vocabulary: string[];
};

export const DEFAULT_MULTILINGUAL_VOICE_CONFIG: MultilingualVoiceConfig = {
  detectionMode: "auto",
  enabledLanguages: [
    { tag: "en-US", label: "English (United States)", enabled: true, priority: 100 },
    { tag: "bn-BD", label: "Bangla (Bangladesh)", enabled: true, priority: 90 },
    { tag: "hi-IN", label: "Hindi (India)", enabled: true, priority: 50 },
  ],
  allowCodeSwitching: true,
  vocabulary: ["AntheticPlus", "AntheticPlus Studios"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, max = 120): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Normalize persisted JSON safely; tolerate older configs and unknown provider tags. */
export function normalizeMultilingualVoiceConfig(value: unknown): MultilingualVoiceConfig {
  if (!isRecord(value)) return structuredClone(DEFAULT_MULTILINGUAL_VOICE_CONFIG);

  const rawLanguages = Array.isArray(value["enabledLanguages"]) ? value["enabledLanguages"] : [];
  const seen = new Set<string>();
  const enabledLanguages: VoiceLanguage[] = [];

  for (const raw of rawLanguages) {
    if (!isRecord(raw)) continue;
    if (enabledLanguages.length >= 100) break;
    const tag = cleanText(raw["tag"], 35);
    const label = cleanText(raw["label"], 80).replace(/[\r\n]/g, " ");
    if (!tag || !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(tag) || seen.has(tag.toLowerCase())) {
      continue;
    }
    seen.add(tag.toLowerCase());
    enabledLanguages.push({
      tag,
      label: label || tag,
      enabled: raw["enabled"] !== false,
      priority:
        typeof raw["priority"] === "number" && Number.isFinite(raw["priority"])
          ? Math.max(0, Math.min(1000, Math.round(raw["priority"])))
          : 0,
    });
  }

  const vocabulary = Array.isArray(value["vocabulary"])
    ? [...new Set(value["vocabulary"].map((item) => cleanText(item, 80)).filter(Boolean))].slice(
        0,
        100,
      )
    : DEFAULT_MULTILINGUAL_VOICE_CONFIG.vocabulary;

  return {
    detectionMode: value["detectionMode"] === "preferred" ? "preferred" : "auto",
    enabledLanguages: enabledLanguages.sort((a, b) => b.priority - a.priority),
    allowCodeSwitching: value["allowCodeSwitching"] !== false,
    vocabulary,
  };
}

/** Short, stable list for provider requests; disabled languages never leak through. */
export function getEnabledLanguageTags(config: MultilingualVoiceConfig): string[] {
  return config.enabledLanguages
    .filter((language) => language.enabled)
    .map((language) => language.tag);
}

/** Apply terminology hints conservatively after transcription; never replace a transcript wholesale. */
export function buildVoiceVocabularyHint(config: MultilingualVoiceConfig): string {
  return config.vocabulary.join(", ");
}

/** Prompt guidance for providers that support natural-language transcription hints. */
export function buildVoiceLanguageGuidance(config: MultilingualVoiceConfig): string {
  const languages = config.enabledLanguages
    .filter((language) => language.enabled)
    .slice(0, 12)
    .map((language) => {
      const label = language.label
        .replace(/[\r\n]/g, " ")
        .trim()
        .slice(0, 40);
      return label && label.toLowerCase() !== language.tag.toLowerCase()
        ? `${label} (${language.tag})`
        : language.tag;
    });
  const languageList = languages.length
    ? languages.join(", ")
    : "provider auto-detection";
  const mode =
    config.detectionMode === "preferred"
      ? "Prefer these languages when the audio is ambiguous, but follow the audio evidence."
      : "Detect the language from the audio; this list is guidance, not a restriction.";
  const mixing = config.allowCodeSwitching
    ? "Preserve natural code-switching within the same utterance."
    : "Prefer the dominant language and do not translate or rewrite code-switched words.";
  return `${mode} Possible languages: ${languageList}. ${mixing}`.slice(0, 600);
}
