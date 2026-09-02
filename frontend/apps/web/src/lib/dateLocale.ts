import type { Locale } from "date-fns";
import { enUS, pt } from "date-fns/locale";
import i18n from "@/i18n";

// PAD-52: locale-aware date formatting. Calendar components used to hardcode
// `enUS`/`enGB` when calling date-fns `format(...)`, so weekday/month names
// always rendered in English regardless of the coach's selected UI language.
// This helper maps the active i18next language (`i18n.language`) to the matching
// date-fns Locale so `format(date, fmt, { locale: dateFnsLocale(i18n.language) })`
// follows the app-wide language preference.
//
// Fallback is Portuguese, matching the app-wide fallback locale locked in PAD-39.
// Components should pass `i18n.language` (from `useTranslation()`) so React
// re-renders them when the language changes.

const LOCALE_MAP: Record<string, Locale> = {
  pt,
  en: enUS,
};

/**
 * Resolve the date-fns `Locale` for a UI language code (e.g. `i18n.language`).
 * Accepts region-tagged codes like `en-GB` (only the primary subtag is used).
 * Falls back to Portuguese for unknown/undefined languages.
 */
export function dateFnsLocale(language?: string): Locale {
  const lng = (language ?? i18n.language ?? "pt").split("-")[0];
  return LOCALE_MAP[lng] ?? pt;
}
