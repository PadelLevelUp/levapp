import { resolveDateLocale } from "@levelup/config";
import type { Locale } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";

/**
 * The date-fns `Locale` for the active UI language (PAD-157).
 *
 * `apps/mobile` imported `date-fns/locale` zero times, so every `format()`
 * call rendered en-US regardless of the user's language: a Portuguese device
 * showed "MON TUE WED" and "Sunday, 23 August" where web showed "SEG TER QUA"
 * and "domingo, 23 de agosto".
 *
 * The language→Locale mapping itself is NOT duplicated here — it lives in
 * `resolveDateLocale` in `@levelup/config`, shared with web and with
 * `useCalendar` (PAD-181). This hook only binds it to the active language.
 *
 * Read it through `useTranslation()` rather than a module-level `i18n.language`
 * so the value is re-derived on every render: that is what makes dates
 * re-render when the coach switches language in Settings, instead of freezing
 * whatever locale was active when the screen first mounted.
 */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return React.useMemo(
    () => resolveDateLocale(i18n.language),
    [i18n.language]
  );
}
