/**
 * PAD-114 — range maths for the attendance page.
 *
 * Everything here works in UTC and speaks bare `YYYY-MM-DD` strings, because
 * that is what the endpoint buckets on (`lesson_instances.start_datetime` is
 * stored naive-UTC). Going through a local-time `Date` would reintroduce the
 * off-by-one-day drift PAD-33 chased down in the messaging timestamps.
 */

import { clubTodayUtcDate } from "@levelup/config";

export type AttendanceRangePreset = "1w" | "1m" | "1y" | "season";

/** The season occurrence a "season" preset reads (calendar.seasons rule 14). */
export interface SeasonRangeLike {
  startDate: string;
  endDate: string;
}

export interface AttendanceRange {
  from: string;
  to: string;
}

/** `YYYY-MM-DD` for a UTC date. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a bare `YYYY-MM-DD` (or a naive ISO datetime) as a UTC date. */
export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/**
 * The range for a preset, computed from `now` on the club's day (B-060).
 *
 * - `1w` — the current week, Monday through Sunday (7 daily buckets)
 * - `1m` — the current calendar month (one bucket per day)
 * - `1y` — the current calendar year (12 monthly buckets)
 * - `season` — the coach's current season occurrence (calendar.seasons rule
 *   14); falls back to the current month when no occurrence is known
 */
export function presetRange(
  preset: AttendanceRangePreset,
  now: Date = new Date(),
  season: SeasonRangeLike | null = null
): AttendanceRange {
  if (preset === "season") {
    if (season) return { from: season.startDate, to: season.endDate };
    preset = "1m";
  }
  // B-060: the club's date (Europe/Lisbon), anchored at UTC midnight so the
  // arithmetic below stays pure calendar maths.
  const today = clubTodayUtcDate(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();

  if (preset === "1w") {
    // getUTCDay(): Sunday = 0. Shift so the week starts on Monday.
    const dayOfWeek = (today.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(y, m, d - dayOfWeek));
    const sunday = new Date(Date.UTC(y, m, d - dayOfWeek + 6));
    return { from: toIsoDate(monday), to: toIsoDate(sunday) };
  }

  if (preset === "1m") {
    const first = new Date(Date.UTC(y, m, 1));
    // Day 0 of the next month is the last day of this one.
    const last = new Date(Date.UTC(y, m + 1, 0));
    return { from: toIsoDate(first), to: toIsoDate(last) };
  }

  return {
    from: toIsoDate(new Date(Date.UTC(y, 0, 1))),
    to: toIsoDate(new Date(Date.UTC(y, 11, 31))),
  };
}

/**
 * B-060: the Presences week, Monday through Sunday, on the club's day.
 * `offset` moves by whole weeks (0 is this week, -1 last week).
 */
export function weekBounds(offset: number, now: Date = new Date()): AttendanceRange {
  const today = clubTodayUtcDate(now);
  const dayOfWeek = (today.getUTCDay() + 6) % 7; // Monday-first
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dayOfWeek + offset * 7)
  );
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  return { from: toIsoDate(monday), to: toIsoDate(sunday) };
}

/**
 * The Monday and Sunday of `weekBounds(offset)` as UTC-midnight Dates, for a
 * label formatted with `timeZone: "UTC"` — so the label can only ever name the
 * week the query asked for (PAD-295).
 */
export function weekLabelDates(offset: number, now: Date = new Date()): { monday: Date; sunday: Date } {
  const { from, to } = weekBounds(offset, now);
  return { monday: new Date(`${from}T00:00:00Z`), sunday: new Date(`${to}T00:00:00Z`) };
}
