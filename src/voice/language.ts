/** Shared multilingual language intelligence for chat + voice. */

export type SupportedVoiceLanguage = {
  language: string;
  locale: string;
  script: "Latin" | "Bengali" | "Devanagari" | "Arabic" | "Cyrillic" | "CJK" | "Other";
  confidence: number;
  mixedLanguages: string[];
};

const LOCALE_MAP: Record<string, string> = {
  bn: "bn-BD", en: "en-US", hi: "hi-IN", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT", pt: "pt-BR",
  ar: "ar-SA", ur: "ur-PK", pa: "pa-IN", ta: "ta-IN", te: "te-IN", ml: "ml-IN", mr: "mr-IN", gu: "gu-IN", kn: "kn-IN",
  zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", ru: "ru-RU", uk: "uk-UA", tr: "tr-TR", id: "id-ID", vi: "vi-VN", nl: "nl-NL",
  sv: "sv-SE", da: "da-DK", no: "nb-NO", pl: "pl-PL", ro: "ro-RO", el: "el-GR", he: "he-IL", th: "th-TH",
};

const BANGGLISH = /\b(ami|amar|amader|apni|apnar|tomar|tomake|kemon|koto|ache|acche|ase|korbo|korben|chai|chao|bhalo|valo|dam|dorkar|ekhon|ajke|kalke|jodi|kichu|ki|keno|kivabe|parbo|parben|niben|dib|den|bhai|apu|plan-er|price-ta|service-ta)\b/gi;
const SPANISH = /\b(que|qué|cómo|cuánto|cuál|para|con|una|del|los|las|precio|plan|quiero|puedo|necesito|dónde|cuando|cuándo|gracias|hola)\b/gi;
const FRENCH = /\b(bonjour|merci|avec|pour|dans|une|les|des|prix|comment|combien|besoin|salut|vous|nous)\b/gi;
const GERMAN = /\b(hallo|danke|bitte|mit|für|und|der|die|das|preis|wie|viel|ich|brauche|möchte)\b/gi;
const HINDI_LATIN = /\b(aap|apka|aapka|mera|meri|hamara|kya|kaise|kitna|chahiye|hai|hain|karna|karenge|mujhe|mujhse|dhanyavaad|namaste)\b/gi;

function baseLanguage(code: string | null | undefined) {
  const c = String(code ?? "").trim().toLowerCase();
  if (!c) return null;
  return c.split(/[-_]/)[0];
}

function scriptFor(language: string, text: string): SupportedVoiceLanguage["script"] {
  if (/\p{Script=Bengali}/u.test(text)) return "Bengali";
  if (/\p{Script=Devanagari}/u.test(text)) return "Devanagari";
  if (/\p{Script=Arabic}/u.test(text)) return "Arabic";
  if (/\p{Script=Cyrillic}/u.test(text)) return "Cyrillic";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}|\p{Script=Hangul}/u.test(text)) return "CJK";
  if (/\p{Script=Latin}/u.test(text)) return "Latin";
  if (language === "bn") return "Bengali";
  if (language === "hi") return "Devanagari";
  if (["ar", "ur", "fa", "ps"].includes(language)) return "Arabic";
  if (["ru", "uk", "bg", "sr", "mk"].includes(language)) return "Cyrillic";
  if (["zh", "ja", "ko"].includes(language)) return "CJK";
  return "Other";
}

function counts(text: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0);
}

function explicitLanguageRequest(text: string): string | null {
  const t = text.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\b(bangla|bengali)\b/, "bn"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\bhindi\b/, "hi"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\bspanish\b/, "es"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\bfrench\b/, "fr"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\bgerman\b/, "de"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\barabic\b/, "ar"],
    [/(?:answer|reply|respond|speak|talk|say).{0,20}\benglish\b/, "en"],
  ];
  return pairs.find(([pattern]) => pattern.test(t))?.[1] ?? null;
}

export function languageMetadataFrom(text: string, hintedLanguage?: string | null, hintedConfidence = 0): SupportedVoiceLanguage {
  const requested = explicitLanguageRequest(text);
  const hinted = baseLanguage(hintedLanguage);
  let language = requested ?? (hinted && hintedConfidence >= 0.6 ? hinted : null);
  let confidence = requested ? 0.99 : hinted && hintedConfidence >= 0.6 ? hintedConfidence : 0.45;
  if (!language) {
    if (/\p{Script=Bengali}/u.test(text)) { language = "bn"; confidence = 0.98; }
    else if (/\p{Script=Devanagari}/u.test(text)) { language = "hi"; confidence = 0.98; }
    else if (/\p{Script=Arabic}/u.test(text)) { language = "ar"; confidence = 0.97; }
    else if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) { language = "ja"; confidence = 0.98; }
    else if (/\p{Script=Hangul}/u.test(text)) { language = "ko"; confidence = 0.98; }
    else if (/\p{Script=Han}/u.test(text)) { language = "zh"; confidence = 0.94; }
    else if (/\p{Script=Greek}/u.test(text)) { language = "el"; confidence = 0.97; }
    else if (/\p{Script=Hebrew}/u.test(text)) { language = "he"; confidence = 0.97; }
    else if (/\p{Script=Thai}/u.test(text)) { language = "th"; confidence = 0.97; }
    else if (/\p{Script=Cyrillic}/u.test(text)) { language = "ru"; confidence = 0.78; }
    else if (counts(text, [BANGGLISH]) >= 2) { language = "bn"; confidence = 0.88; }
    else if (counts(text, [HINDI_LATIN]) >= 2) { language = "hi"; confidence = 0.84; }
    else if (counts(text, [SPANISH]) >= 2) { language = "es"; confidence = 0.84; }
    else if (counts(text, [FRENCH]) >= 2) { language = "fr"; confidence = 0.82; }
    else if (counts(text, [GERMAN]) >= 2) { language = "de"; confidence = 0.82; }
    else { language = "en"; confidence = 0.7; }
  }

  const mixed = new Set<string>();
  if (language !== "en" && /\p{Script=Latin}/u.test(text)) mixed.add("en");
  if (language !== "bn" && /\p{Script=Bengali}/u.test(text)) mixed.add("bn");
  if (language !== "hi" && /\p{Script=Devanagari}/u.test(text)) mixed.add("hi");
  if (language !== "ar" && /\p{Script=Arabic}/u.test(text)) mixed.add("ar");
  const englishWordCount = counts(text, [/\b(the|and|or|with|for|your|you|please|price|plan|automation|email|account|website|support)\b/gi]);
  if (language !== "en" && englishWordCount >= 2) mixed.add("en");
  if (language === "bn" && counts(text, [BANGGLISH]) >= 2 && !/\p{Script=Bengali}/u.test(text)) mixed.add("bn-Latn");

  return {
    language,
    locale: LOCALE_MAP[language] ?? `${language}-${language.toUpperCase()}`,
    script: scriptFor(language, text),
    confidence: Math.max(0, Math.min(1, confidence)),
    mixedLanguages: [...mixed].slice(0, 4),
  };
}

export function localeForLanguage(language: string | null | undefined) {
  const base = baseLanguage(language) ?? "en";
  return LOCALE_MAP[base] ?? "en-US";
}

/** Eleven v4 accepts ISO language-family hints in content; this is metadata only. */
export function responseLanguageForReply(reply: string, requested?: SupportedVoiceLanguage | null) {
  const detected = languageMetadataFrom(reply, requested?.language, requested?.confidence ?? 0);
  if (requested && detected.confidence < 0.8 && requested.confidence >= 0.8) {
    return { ...requested, mixedLanguages: [...new Set([...requested.mixedLanguages, ...detected.mixedLanguages])] };
  }
  return detected;
}

export function sentenceSegments(text: string, maxChars = 1800): string[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?。！？\n]+(?:[.!?。！？]+|\n|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [normalized];
  const out: string[] = [];
  let bucket = "";
  for (const sentence of sentences) {
    if (!bucket) { bucket = sentence; continue; }
    if ((bucket + " " + sentence).length <= maxChars) bucket += " " + sentence;
    else { out.push(bucket); bucket = sentence; }
  }
  if (bucket) out.push(bucket);
  return out.slice(0, 8);
}
