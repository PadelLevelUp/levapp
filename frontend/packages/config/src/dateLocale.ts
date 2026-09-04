import { addDays, format } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, pt } from "date-fns/locale";

// PAD-52 / PAD-181: locale-aware date formatting, shared by both shells.
//
// Calendar surfaces used to hardcode `enUS`/`enGB` when calling date-fns
// `format(...)`, so weekday/month names always rendered in English regardless of
// the coach's selected UI language. PAD-52 fixed the web components with a
// helper in `apps/web/src/lib/dateLocale.ts`; PAD-181 lifted that helper here so
// `@levelup/hooks`' `useCalendar` and the iOS shell can use the same mapping —
// the week-range label was still English-only on both platforms because the hook
// could not reach an app-level module.
//
// This module is deliberately platform-neutral: it takes the language as an
// argument rather than importing an i18next instance, so nothing in `packages/*`
// depends on React DOM, React Native or Expo. Each shell passes its own active
// language in (web: `i18n.language` from `useTranslation()`; mobile: the same,
// from `apps/mobile/src/lib/i18n.ts`), which is also what makes the label
// re-render on a language switch.
//
// Fallback is Portuguese, matching the app-wide fallback locale locked in PAD-39
// (settings.language rule 4). Mobile's i18next `fallbackLng` is `en` by design
// (see the note in `apps/mobile/src/lib/i18n.ts`), but its language detection
// only ever yields `pt` or `en`, so this fallback never fires there.

const LOCALE_MAP: Record<string, Locale> = {
  pt,
  en: enUS,
};

/**
 * Resolve the date-fns `Locale` for a UI language code (e.g. `i18n.language`).
 * Accepts region-tagged codes like `en-GB` (only the primary subtag is used).
 * Falls back to Portuguese for unknown/undefined languages.
 */
export function resolveDateLocale(language?: string): Locale {
  const lng = (language ?? "pt").split("-")[0];
  return LOCALE_MAP[lng] ?? pt;
}

/**
 * Compact week-range label for a week starting at `weekStart` — e.g. "6–12 Jul"
 * / "6–12 jul" when the week sits inside one month, "31 Aug–6 Sep" / "31 ago–6
 * set" when it straddles two. Kept short so it stays on a single line even on a
 * narrow (375px) mobile header.
 *
 * Pure: pass the resolved `Locale` in, so the caller controls the language and
 * the label is derived on every render instead of frozen into state
 * (calendar.view rule 12).
 */
export function formatWeekRangeLabel(weekStart: Date, locale: Locale): string {
  const start = weekStart;
  const end = addDays(weekStart, 6);

  const sameMonth =
    format(start, "MMM", { locale }) === format(end, "MMM", { locale });

  if (sameMonth) {
    return `${format(start, "d", { locale })}–${format(end, "d MMM", { locale })}`;
  }

  return `${format(start, "d MMM", { locale })}–${format(end, "d MMM", { locale })}`;
}
