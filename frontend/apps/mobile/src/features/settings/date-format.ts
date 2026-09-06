/**
 * Locale-aware date strings for the Settings screens.
 *
 * PAD-157: these two call sites used `toLocaleDateString(undefined, …)`, which
 * resolves to the *device* locale, not the app language. On an English-locale
 * phone with the app set to Portuguese the import history printed
 * "Sep 5, 2026, 02:30 PM" — an English month name on a pt screen, which is
 * exactly what the ticket says must not happen anywhere.
 *
 * The rest of the shell formats dates with date-fns and a resolved `Locale`
 * (see `src/lib/date-locale.ts`), but these two values are ISO *timestamps*
 * rather than the `yyyy-MM-dd` strings `@levelup/config`'s `shortDate` /
 * `longDate` parse, so they stay on `Intl` — the same mechanism
 * `@levelup/config/dashboard-format` uses — and simply take the language as an
 * argument instead of defaulting to the device.
 *
 * Pure and language-in, so the caller (a component reading `i18n.language` from
 * `useTranslation()`) re-derives them on every render and a language switch
 * repaints them; nothing is frozen into state.
 */

/** "5 set 2026, 14:30" / "Sep 5, 2026, 2:30 PM" — an import-run timestamp. */
export function formatImportTimestamp(isoString: string, language: string): string {
  return new Date(isoString).toLocaleDateString(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "12/10/2026" / "10/12/2026" — an invitation expiry, numeric in both languages
 * but ordered by the app language rather than by the phone's region. */
export function formatInviteExpiry(isoString: string, language: string): string {
  return new Date(isoString).toLocaleDateString(language);
}
