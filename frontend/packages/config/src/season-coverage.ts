/**
 * Which season covers a date (PAD-170 C7).
 *
 * `calendar.seasons` rule 8 makes "recurs until season end" fail CLOSED: the
 * backend rejects the create with `no_season_covers_date` when no season covers
 * the class's start date. Web only learns that after the round trip
 * (`AddClassSheet` renders the rejection in place). This module lets a shell ask
 * the same question BEFORE submitting, so the coach is warned while they are
 * still looking at the toggle they just turned on.
 *
 * It is a hint, never a gate: the browser/phone's season list can be stale, and
 * the server stays the authority. Both shells share it rather than each deriving
 * the range test, which is exactly the drift `findOverlappingEvent` was pulled
 * in here to stop.
 *
 * Ranges are INCLUSIVE at both ends, matching `calendar.seasons` rule 1's
 * `start_a <= end_b and start_b <= end_a` overlap test.
 *
 * Like the rest of `@levelup/config` this takes a minimal structural shape
 * rather than importing `@levelup/types`.
 */

/** The little a season has to expose to be asked whether it covers a date. */
export interface SeasonLike {
  /** Inclusive first day, "YYYY-MM-DD". */
  startDate: string;
  /** Inclusive last day, "YYYY-MM-DD". */
  endDate: string;
}

/** Normalize any date value to its "YYYY-MM-DD" day key. */
const dayKey = (date: string | null | undefined): string => (date ?? "").slice(0, 10);

/**
 * The first season whose inclusive [startDate, endDate] range contains `date`.
 *
 * Comparison is lexicographic on the "YYYY-MM-DD" day keys — for zero-padded
 * ISO dates that is the same ordering as a calendar comparison, and it avoids
 * dragging a timezone into a question that has none.
 *
 * Generic in the season type so a caller gets its own richer season back rather
 * than this module's minimal shape.
 *
 * @returns the covering season, or `null` when the date falls in no season (or
 *          when either argument is missing, which is "unknown", not "covered").
 */
export function findSeasonCoveringDate<T extends SeasonLike>(
  date: string | null | undefined,
  seasons: T[] | null | undefined
): T | null {
  const day = dayKey(date);
  if (day.length !== 10) return null;

  for (const season of seasons ?? []) {
    const start = dayKey(season?.startDate);
    const end = dayKey(season?.endDate);
    if (!start || !end) continue;
    if (start <= day && day <= end) return season;
  }

  return null;
}
