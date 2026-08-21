/**
 * Locale-aware formatting for the coach dashboard.
 *
 * The server sends ISO dates and English weekday names; every user-facing date
 * string is produced here from the ISO value using the active i18n locale, so
 * pt-PT renders "terça-feira, 4 de agosto" rather than a translated-looking
 * English string. The server's `weekday` field is only ever a switch, never
 * something we print.
 */

/** `Morning` / `Afternoon` / `Evening` — the key, not the copy. */
export type GreetingKey = "morning" | "afternoon" | "evening";

export function greetingKey(now: Date = new Date()): GreetingKey {
  const h = now.getHours();
  if (h < 12) return "morning";
  if (h < 19) return "afternoon";
  return "evening";
}

/** Parses `YYYY-MM-DD` as a LOCAL date. `new Date("2026-08-04")` is UTC and
 * shifts a day backwards for anyone west of Greenwich. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Today as `YYYY-MM-DD` in LOCAL time.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious way to write this and
 * is wrong: it yields the UTC date, which `parseISODate` then reads back as
 * local. The round trip reintroduces exactly the off-by-one this module exists
 * to prevent — in Lisbon in summer, between 00:00 and 01:00 the header shows
 * yesterday.
 */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "Tuesday, 4 August" / "terça-feira, 4 de agosto". */
export function longDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseISODate(iso));
}

/** "Sun 9 Aug" — the compact form used inside queue rows. */
export function shortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseISODate(iso));
}

/** "SUN" — the schedule's date column. Uppercased for the column, not the copy. */
export function weekdayShort(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" })
    .format(parseISODate(iso))
    .replace(".", "")
    .toUpperCase();
}

/** "Tuesday" — the hero eyebrow when the next class isn't today. */
export function weekdayLong(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(parseISODate(iso));
}
