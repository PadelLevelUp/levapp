import { addDays, addMonths, format, isValid, parseISO } from "date-fns";

/**
 * PAD-507 (notifications.waiting-list rule 2): a standing waiting-list entry runs to an end date the
 * coach picks — today at the earliest, 12 months ahead at the latest, renewable, never open-ended
 * (owner decision 2026-10-03). The presets are shortcuts that fill the date. The server checks the
 * same bounds on its own (club) clock.
 */
export const STANDING_MAX_MONTHS = 12;

export type StandingPreset = "1w" | "2w" | "1m" | "2m" | "6m" | "12m";

export const STANDING_PRESETS: { key: StandingPreset; labelKey: string }[] = [
  { key: "1w", labelKey: "players.duration1Week" },
  { key: "2w", labelKey: "players.duration2Weeks" },
  { key: "1m", labelKey: "players.duration1Month" },
  { key: "2m", labelKey: "players.duration2Months" },
  { key: "6m", labelKey: "players.duration6Months" },
  { key: "12m", labelKey: "players.duration12Months" },
];

export const DEFAULT_STANDING_PRESET: StandingPreset = "1m";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** The end date a preset gives, counted from `today`. */
export function standingEndFor(preset: StandingPreset, today: Date): string {
  switch (preset) {
    case "1w":
      return iso(addDays(today, 7));
    case "2w":
      return iso(addDays(today, 14));
    case "1m":
      return iso(addMonths(today, 1));
    case "2m":
      return iso(addMonths(today, 2));
    case "6m":
      return iso(addMonths(today, 6));
    case "12m":
      return iso(addMonths(today, STANDING_MAX_MONTHS));
  }
}

/** The dates an end may take: today through 12 months ahead (ISO dates). */
export function standingEndBounds(today: Date): { min: string; max: string } {
  return { min: iso(today), max: iso(addMonths(today, STANDING_MAX_MONTHS)) };
}

/** Whether `value` is an ISO date inside the bounds. */
export function isStandingEndAllowed(value: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(parseISO(value))) return false;
  const { min, max } = standingEndBounds(today);
  return value >= min && value <= max;
}

/** The preset whose date `end` is, if any — the pill shown as chosen. */
export function standingPresetOf(end: string, today: Date): StandingPreset | null {
  return STANDING_PRESETS.find((p) => standingEndFor(p.key, today) === end)?.key ?? null;
}

/** "3 nov 2026" / "Nov 3, 2026" — the date an entry runs to, with the year (it can be 12 months out). */
export function standingEndLabel(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(y, m - 1, d));
}
