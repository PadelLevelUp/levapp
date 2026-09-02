import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Mobile i18n infrastructure (mobile-web-parity plan, Phase 0.5). Mirrors
// apps/web/src/i18n.ts: translation strings live in the monorepo-root
// src/locales/<lng>/<namespace>.json files — ONE shared source of truth for
// both platforms, so a translator only ever edits one tree. Vite's
// import.meta.glob (used on web) has no Metro equivalent, so each namespace
// file is statically imported instead; metro.config.js already watches the
// workspace root for the raw-TS @levelup/* packages, so these resolve and
// hot-reload the same way.
//
// Each namespace file's single top-level key (e.g. {"common": {...}}) is
// deep-merged into one "translation" resource per language, so callers use
// the same `t("common.save")` / `t("settings.language")` shape on both
// platforms.
//
// Locked decisions for this module:
// - fallbackLng "en": every existing mobile screen is hardcoded English
//   today (retrofit to useTranslation() is a separate follow-up ticket, see
//   plans/mobile-web-parity-plan.md Phase 0 item 5) so an English fallback
//   degrades gracefully for untranslated keys. Web's fallback is "pt"
//   (PAD-39, locked) — the two platforms intentionally diverge here until
//   the mobile retrofit lands full pt coverage.
// - compatibilityJSON is left at i18next's current default (Intl.PluralRules
//   -based plurals). RN 0.81's Hermes ships with ICU/Intl support, so the
//   legacy `v4` compatibility shim isn't needed.
// - Initial language: device locale via expo-localization (pt if the device
//   is set to pt, otherwise en). This is overridden once the signed-in
//   user's persisted `language` preference loads — see AuthContext, which
//   calls i18n.changeLanguage() when `user.language` is known.

import authEn from "../../../../src/locales/en/auth.json";
import availabilityEn from "../../../../src/locales/en/availability.json";
import calendarEn from "../../../../src/locales/en/calendar.json";
import classDetailEn from "../../../../src/locales/en/classDetail.json";
import commonEn from "../../../../src/locales/en/common.json";
import dashboardEn from "../../../../src/locales/en/dashboard.json";
import messagesEn from "../../../../src/locales/en/messages.json";
import miscEn from "../../../../src/locales/en/misc.json";
import navEn from "../../../../src/locales/en/nav.json";
import notificationsUiEn from "../../../../src/locales/en/notificationsUi.json";
import playersEn from "../../../../src/locales/en/players.json";
import presencesEn from "../../../../src/locales/en/presences.json";
import settingsEn from "../../../../src/locales/en/settings.json";
import studentsEn from "../../../../src/locales/en/students.json";
import trainingEn from "../../../../src/locales/en/training.json";
import uiEn from "../../../../src/locales/en/ui.json";

import authPt from "../../../../src/locales/pt/auth.json";
import availabilityPt from "../../../../src/locales/pt/availability.json";
import calendarPt from "../../../../src/locales/pt/calendar.json";
import classDetailPt from "../../../../src/locales/pt/classDetail.json";
import commonPt from "../../../../src/locales/pt/common.json";
import dashboardPt from "../../../../src/locales/pt/dashboard.json";
import messagesPt from "../../../../src/locales/pt/messages.json";
import miscPt from "../../../../src/locales/pt/misc.json";
import navPt from "../../../../src/locales/pt/nav.json";
import notificationsUiPt from "../../../../src/locales/pt/notificationsUi.json";
import playersPt from "../../../../src/locales/pt/players.json";
import presencesPt from "../../../../src/locales/pt/presences.json";
import settingsPt from "../../../../src/locales/pt/settings.json";
import studentsPt from "../../../../src/locales/pt/students.json";
import trainingPt from "../../../../src/locales/pt/training.json";
import uiPt from "../../../../src/locales/pt/ui.json";

type Dict = Record<string, unknown>;

/** Deep-merge source into target (objects merge, everything else overwrites). */
function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge({ ...(tv as Dict) }, sv as Dict);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

const enNamespaces: Dict[] = [
  authEn,
  availabilityEn,
  calendarEn,
  classDetailEn,
  commonEn,
  dashboardEn,
  messagesEn,
  miscEn,
  navEn,
  notificationsUiEn,
  playersEn,
  presencesEn,
  settingsEn,
  studentsEn,
  trainingEn,
  uiEn,
];

const ptNamespaces: Dict[] = [
  authPt,
  availabilityPt,
  calendarPt,
  classDetailPt,
  commonPt,
  dashboardPt,
  messagesPt,
  miscPt,
  navPt,
  notificationsUiPt,
  playersPt,
  presencesPt,
  settingsPt,
  studentsPt,
  trainingPt,
  uiPt,
];

export const SUPPORTED_LANGUAGES = ["pt", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const resources: Record<AppLanguage, { translation: Dict }> = {
  en: { translation: enNamespaces.reduce(deepMerge, {}) },
  pt: { translation: ptNamespaces.reduce(deepMerge, {}) },
};

/** Device locale, mapped to a supported language (pt if pt, else en). */
function detectDeviceLanguage(): AppLanguage {
  const deviceLanguageCode = Localization.getLocales()[0]?.languageCode;
  return deviceLanguageCode === "pt" ? "pt" : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
