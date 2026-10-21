/**
 * The first day of every week a coach or student sees (calendar.view rule 5a, PAD-682).
 *
 * 0 = Sunday, in the `Date.getDay()` / date-fns `weekStartsOn` numbering. Global, not a setting.
 * The backend's own weeks start on the same day (`padel_app/utils/week.py`); a backend test
 * reads this file to keep the two in step.
 */
export const WEEK_STARTS_ON = 0 as const;

/** Days from the start of the week to a weekday (`getDay()` / `getUTCDay()` numbering, 0 = Sunday). */
export function daysSinceWeekStart(dayOfWeek: number): number {
  return (dayOfWeek - WEEK_STARTS_ON + 7) % 7;
}

/**
 * The seven `getDay()` numbers in display order, starting at `WEEK_STARTS_ON` (Sunday first:
 * [0, 1, 2, 3, 4, 5, 6]). Display order only: a weekday's value never changes.
 */
export const WEEKDAYS_FROM_WEEK_START: readonly number[] = Array.from(
  { length: 7 },
  (_, i) => (WEEK_STARTS_ON + i) % 7,
);
