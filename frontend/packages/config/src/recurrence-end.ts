import { seasonOccurrenceContaining, type SeasonDefinitionLike } from "./season-coverage";

/**
 * classes.class-requests rule 14a (PAD-428): the wizard's "Termina ao fim de N
 * aulas" option. The client turns a class COUNT into the `endDate` the wire
 * already carries (`recurrence {weekdays, startDate, endDate}`), so the backend,
 * rules 14–17 and older builds stay untouched. One shared function serves both
 * shells, so web and iOS cannot disagree on the arithmetic.
 *
 * Pure date arithmetic on calendar dates (YYYY-MM-DD): dates are only ever built
 * with `Date.UTC` and read back with `getUTCDay`/`toISOString`, so this never
 * touches the runner's local timezone (the `new Date("YYYY-MM-DD")` + `getDay()`
 * pitfall this module avoids).
 */

/** The largest N the wizard's "after N classes" input accepts. */
export const MAX_REQUEST_CLASSES = 52;

const isoWeekday = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
};

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * The date of the `count`-th occurrence on `weekdays` (1 = Monday … 7 = Sunday),
 * counting from `startDate` INCLUSIVE — N counts classes, not weeks: Tue+Thu
 * from a Tuesday, 4 classes is two weeks, not four. `null` when there is
 * nothing to count: no weekday chosen, or `count < 1`.
 */
export function endDateAfterClasses(startDate: string, weekdays: number[], count: number): string | null {
  if (weekdays.length === 0 || count < 1) return null;
  const wanted = new Set(weekdays);
  // At least one weekday is chosen, so an occurrence lands at least once a
  // week: count weeks plus a margin is always enough days to search.
  const limit = count * 7 + 7;
  let day = startDate;
  let found = 0;
  for (let i = 0; i < limit; i++) {
    if (wanted.has(isoWeekday(day))) {
      found++;
      if (found === count) return day;
    }
    day = addDays(day, 1);
  }
  return null;
}

/**
 * classes.create rule 9 (PAD-463): the coach's recurring class ends after N classes. Its
 * `daysOfWeek` are the calendar's convention (0 = Sunday … 6 = Saturday, `calendar_tools.WEEKDAY_MAP`),
 * not the ISO days `endDateAfterClasses` counts on, so Sunday is mapped 0 → 7 first. The series
 * expands with no skipped dates up to an inclusive end, so this end date gives exactly N classes.
 */
export function seriesEndAfterClasses(startDate: string, calendarDays: number[], count: number): string | null {
  return endDateAfterClasses(startDate, calendarDays.map((day) => (day === 0 ? 7 : day)), count);
}

/**
 * classes.create rule 9: a count is never capped by the season, but the form says when the last
 * class falls after the end of the season occurrence containing the start date. The end of that
 * occurrence, or `null` when there is nothing to say (no season, a start in a gap, or inside it).
 */
export function countPassesSeasonEnd(
  startDate: string,
  lastDate: string | null,
  definition: SeasonDefinitionLike | null | undefined
): string | null {
  if (!lastDate) return null;
  const occurrence = seasonOccurrenceContaining(startDate, definition);
  return occurrence && lastDate > occurrence.endDate ? occurrence.endDate : null;
}
