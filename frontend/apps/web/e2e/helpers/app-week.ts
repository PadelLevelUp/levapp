import type { Page } from "@playwright/test";
// The app's own constant (@levelup/config), by path: Playwright's loader does not resolve the
// package's subpath.
import { WEEK_STARTS_ON, daysSinceWeekStart } from "../../../../packages/config/src/week-start";

/**
 * PAD-811 (B-720): the app's weeks, for specs that navigate by week.
 *
 * Weeks start on WEEK_STARTS_ON (Sunday, calendar.view rule 5a / PAD-682), so "next Monday" is
 * not always in the next week: on a Sunday it is tomorrow, inside the week on screen. A spec that
 * clicks "Next week" once to reach a Monday was a week too far every Sunday. These helpers count
 * the weeks with the app's own constant instead.
 *
 * Every date here is a club-day `yyyy-MM-dd`; no time zone arithmetic happens on them.
 */

const CLUB_TZ = "Europe/Lisbon";
const DAY_MS = 86_400_000;

/**
 * The day the run is anchored on: `E2E_SEED_TODAY` when set (the same pin seed_dates.py reads, so
 * the seed and the spec agree), else today on the club's clock.
 */
export function e2eToday(): string {
  return process.env.E2E_SEED_TODAY || new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ }).format(new Date());
}

export function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `getDay()` numbering, 0 = Sunday. */
function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The first day of the app week that holds `iso`. */
export function appWeekStart(iso: string): string {
  return isoPlusDays(iso, -daysSinceWeekStart(dayOfWeek(iso)));
}

/** How many "Next week" clicks from the week of `today` reach the week of `target` (0 = same week). */
export function appWeeksAhead(target: string, today: string = e2eToday()): number {
  return Math.round((Date.parse(appWeekStart(target)) - Date.parse(appWeekStart(today))) / (7 * DAY_MS));
}

/** The day with `getDay()` number `weekday` in the app week `weeksAhead` weeks from `today`'s. */
export function dayInAppWeek(weekday: number, weeksAhead: number, today: string = e2eToday()): string {
  return isoPlusDays(appWeekStart(today), 7 * weeksAhead + daysSinceWeekStart(weekday));
}

/**
 * The seeded "E2E Academy Class" day: the first Monday strictly after today, exactly as
 * seed_dates.py's `_next_weekday(today, 0)` computes it. On a Sunday that is tomorrow, in the
 * current app week; on every other weekday it is in the next one.
 */
export function seedAcademyMonday(today: string = e2eToday()): string {
  return isoPlusDays(today, (1 - dayOfWeek(today) + 7) % 7 || 7);
}

/**
 * Run the browser on the pinned day when `E2E_SEED_TODAY` is set, so the app's "this week" is the
 * seed's. A no-op otherwise. Call before the first navigation. 10:00 UTC is the same date in
 * Lisbon all year.
 */
export async function pinBrowserToE2eToday(page: Page): Promise<void> {
  const pinned = process.env.E2E_SEED_TODAY;
  if (pinned) await page.clock.install({ time: new Date(`${pinned}T10:00:00Z`) });
}

export { WEEK_STARTS_ON };
