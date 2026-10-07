import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import pt from "./locales/pt.json";

// admin.foundation rule 16: the shared setup (i18next + react-i18next), pt and en, the browser's
// language, fallback pt. The console's strings live only here (rule 14), never in the product's
// locale tree.
export const SUPPORTED_LANGUAGES = ["pt", "en"] as const;
export type AdminLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function detectLanguage(navigatorLanguage: string | undefined): AdminLanguage {
  return (navigatorLanguage ?? "").toLowerCase().startsWith("en") ? "en" : "pt";
}

i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en } },
  lng: detectLanguage(typeof navigator !== "undefined" ? navigator.language : undefined),
  fallbackLng: "pt",
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

function syncDocumentLang(lng: string) {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
}
syncDocumentLang(i18n.language);
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
