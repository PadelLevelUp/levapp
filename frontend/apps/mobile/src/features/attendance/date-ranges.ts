/**
 * PAD-162 — range maths for the mobile attendance history screen.
 *
 * A port of `apps/web/src/components/attendance/dateRanges.ts` (PAD-114). It is
 * deliberately duplicated rather than lifted into `@levelup/config`: the shared
 * packages are consumed by both apps, and moving it would rewrite web's
 * attendance AND absences pages in a ticket whose whole point is the iOS side.
 * The behaviour is pinned by `date-ranges.test.ts` here and by web's own suite,
 * so a divergence fails a test on one side or the other.
 *
 * Everything works in UTC and speaks bare `YYYY-MM-DD` strings, because that is
 * what the endpoint buckets on (`lesson_instances.start_datetime` is stored
 * naive-UTC). Going through a local-time `Date` would reintroduce the
 * off-by-one-day drift PAD-33 chased down in the messaging timestamps.
 */

export type AttendanceRangePreset = "1w" | "1m" | "1y";

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
 * The range for a preset, computed from `now` in UTC (spec `attendance.history`
 * rule 10).
 *
 * - `1w` — the current week, Monday through Sunday (7 daily buckets)
 * - `1m` — the current calendar month (one bucket per day)
 * - `1y` — the current calendar year (12 monthly buckets)
 */
export function presetRange(
  preset: AttendanceRangePreset,
  now: Date = new Date()
): AttendanceRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  if (preset === "1w") {
    // getUTCDay(): Sunday = 0. Shift so the week starts on Monday.
    const dayOfWeek = (now.getUTCDay() + 6) % 7;
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
 * Whether a custom period is submittable (spec rule 11/12).
 *
 * Both ends are required and `from` must not be after `to`. String comparison
 * is exact for zero-padded `YYYY-MM-DD`, so no Date is constructed — the same
 * check web's `handleApply` makes, extracted so it can be tested without a
 * renderer.
 */
export function isValidCustomRange(from: string, to: string): boolean {
  return Boolean(from) && Boolean(to) && from <= to;
}
