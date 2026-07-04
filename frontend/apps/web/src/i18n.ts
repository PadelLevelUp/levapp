import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Minimal bundled resources. This ticket ships i18n INFRASTRUCTURE only;
// full app-UI translation is a follow-up (PAD-40). We seed a small settings
// namespace so the language selector itself is localized and the wiring is proven.
const resources = {
  pt: {
    translation: {
      settings: {
        language: "Idioma",
        languageDescription: "Escolhe o idioma da aplicação e das notificações.",
        portuguese: "Português",
        english: "Inglês",
      },
    },
  },
  en: {
    translation: {
      settings: {
        language: "Language",
        languageDescription: "Choose the language for the app and notifications.",
        portuguese: "Portuguese",
        english: "English",
      },
    },
  },
} as const;

export const SUPPORTED_LANGUAGES = ["pt", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18n.use(initReactI18next).init({
  resources,
  lng: "pt",
  fallbackLng: "pt", // Fallback locale is Portuguese (PAD-39 locked decision)
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
