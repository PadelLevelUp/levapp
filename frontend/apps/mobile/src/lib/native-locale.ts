/**
 * The BCP-47 tag to hand to a *native* iOS/Android control (PAD-157).
 *
 * `useDateLocale()` returns a date-fns `Locale`, which only helps JS-side
 * `format()` calls. UIKit widgets — the `@react-native-community/datetimepicker`
 * spinner, for one — take a locale identifier string instead, and default to
 * the device locale when given none. That is why the in-app date picker showed
 * "September / October / November" on a Portuguese app: nothing ever told it
 * which language the app was in.
 *
 * Kept as a plain module (no React, no i18next) so it is unit-testable under
 * mobile's Node-only vitest setup.
 *
 * The fallback is Portuguese, matching `resolveDateLocale` in `@levelup/config`
 * and web's `fallbackLng` (PAD-39).
 */
export function nativeLocaleTag(language: string | null | undefined): string {
  const primary = (language ?? "").split("-")[0].toLowerCase();
  return primary === "en" ? "en-US" : "pt-PT";
}
