import { clubTodayISO, lisbonNowMs, wallClockMs } from "./club-date";

/**
 * PAD-439 (players.profile rules 5a/5b): what the "Add to classes" picker offers, on web and iOS.
 * Owner decision, 2026-09-24: the picker never offers a class that has already happened, so
 * nobody adds a player to the past by mistake, and it cannot step back before the current week.
 * "Happened" is "has started", judged on the club's clock like every other client comparison with
 * a stored class time (B-066): class dates and times are Lisbon wall clock (R-023).
 */

/** The classes the picker lists: those that have not started yet. */
export function upcomingPickerClasses<T extends { date: string; startTime: string }>(classes: T[], now: Date = new Date()): T[] {
  const nowMs = lisbonNowMs(now);
  return classes.filter((c) => wallClockMs(c.date, c.startTime) > nowMs);
}

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Monday (YYYY-MM-DD) of the club's current week. */
function clubWeekMondayISO(now: Date): string {
  const [y, m, d] = clubTodayISO(now).split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const back = (today.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
}

/** Whether the picker may step back from `weekStart` (a local Monday): only when it is after the current week. */
export function canStepBackPickerWeek(weekStart: Date, now: Date = new Date()): boolean {
  return isoOf(weekStart) > clubWeekMondayISO(now);
}
