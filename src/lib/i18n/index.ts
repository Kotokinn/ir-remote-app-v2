import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { ParseKeys } from "i18next";
import en from "./locales/en.json";
import { DEFAULT_LANGUAGE, findLanguage, LANGUAGES, matchLanguage } from "./languages";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    // English is the source of truth: `t("…")` is checked against its keys at compile time.
    resources: { translation: typeof en };
  }
}

/** A key of en.json — for data that stores "which text" and is translated where it is drawn. */
export type TKey = ParseKeys;

const STORAGE_KEY = "smart-home-language";

// Always starts in English (bundled, and what the static HTML is prerendered in, so hydration matches);
// the stored / device language is applied right after mount by I18nProvider.
void i18n.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  initAsync: false, // resources are inline: be ready before the first render, even outside React
});

export { i18n };
export const t = i18n.t.bind(i18n);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** What the user picked, else the first device language we ship, else English. */
export function detectLanguage(): string {
  const stored = readStored();
  if (stored && findLanguage(stored)) return stored;
  for (const tag of navigator.languages) {
    const match = matchLanguage(tag);
    if (match) return match.code;
  }
  return DEFAULT_LANGUAGE;
}

function applyDocumentLanguage(code: string) {
  const language = findLanguage(code);
  document.documentElement.lang = code;
  document.documentElement.dir = language?.rtl ? "rtl" : "ltr";
}

/** Loads the bundle on demand and switches. `remember` = the user chose it (vs. auto-detected). */
export async function setLanguage(code: string, remember = false): Promise<void> {
  const language = findLanguage(code) ?? LANGUAGES[0];
  if (!i18n.hasResourceBundle(language.code, "translation")) {
    i18n.addResourceBundle(language.code, "translation", await language.load());
  }
  await i18n.changeLanguage(language.code);
  applyDocumentLanguage(language.code);
  if (remember) {
    try {
      window.localStorage.setItem(STORAGE_KEY, language.code);
    } catch {
      // private mode etc.: the choice just won't survive a restart
    }
  }
}
