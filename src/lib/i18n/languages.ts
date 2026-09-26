/**
 * Languages the app ships. Adding one = drop a `locales/<code>.json` (same keys as en.json; anything missing
 * falls back to English), then add a line here. Nothing else changes — bundles are loaded on demand.
 */
export interface LanguageInfo {
  /** BCP 47 tag; also the file name under ./locales. */
  code: string;
  /** The language's own name — what its speakers look for in the list. */
  nativeName: string;
  rtl?: boolean;
  load: () => Promise<Record<string, unknown>>;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", nativeName: "English", load: async () => (await import("./locales/en.json")).default },
  { code: "vi", nativeName: "Tiếng Việt", load: async () => (await import("./locales/vi.json")).default },
];

export const DEFAULT_LANGUAGE = "en";

export function findLanguage(code: string): LanguageInfo | undefined {
  return LANGUAGES.find((language) => language.code === code);
}

/** "vi-VN" → "vi"; "zh-TW" → "zh-TW" when shipped, else the base language, else undefined. */
export function matchLanguage(tag: string): LanguageInfo | undefined {
  const exact = LANGUAGES.find((language) => language.code.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const base = tag.split("-")[0]?.toLowerCase();
  return LANGUAGES.find((language) => language.code.toLowerCase() === base);
}
