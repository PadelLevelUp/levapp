import type { Locale } from "date-fns";
import { resolveDateLocale } from "@levelup/config";
import i18n from "@/i18n";

// PAD-52: locale-aware date formatting. Calendar components used to hardcode
// `enUS`/`enGB` when calling date-fns `format(...)`, so weekday/month names
// always rendered in English regardless of the coach's selected UI language.
//
// PAD-181 lifted the language -> date-fns Locale mapping itself into
// `@levelup/config` (`resolveDateLocale`) so `@levelup/hooks`' `useCalendar` and
// the iOS shell share one resolver. This module stays as the web-side wrapper:
// it keeps the `i18n.language` default that the existing call sites rely on
// (packages must not import the web app's i18next instance).
//
// Components should still pass `i18n.language` (from `useTranslation()`)
// explicitly so React re-renders them when the language changes; the default is
// only for non-component callers.

/**
 * Resolve the date-fns `Locale` for a UI language code (e.g. `i18n.language`).
 * Accepts region-tagged codes like `en-GB` (only the primary subtag is used).
 * Falls back to the active i18next language, then to Portuguese.
 */
export function dateFnsLocale(language?: string): Locale {
  return resolveDateLocale(language ?? i18n.language);
}

export { resolveDateLocale };
