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
