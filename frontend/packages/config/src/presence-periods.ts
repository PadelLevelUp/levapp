import { clubTodayUtcDate } from "./club-date";
import { isValidCustomRange } from "./custom-range";
import type { SeasonOccurrenceRange } from "./season-coverage";
import { daysSinceWeekStart } from "./week-start";

/**
 * PAD-837 (attendance.validation rule 17g): the Presences tab's period shortcuts, once for both
 * shells, on the club's day (rule 15, B-060) whatever the device's zone.
 *
 * Bounds are bare inclusive `YYYY-MM-DD`, sent as `from`/`to`. A calendar period runs to its last
 * day ("Este mês" ends on the 30th); the server reads it only up to today (rule 17h), so nothing
 * here clamps.
 */

export type PresencePeriodShortcut = "thisWeek" | "thisMonth" | "lastMonth" | "season" | "all";

/**
 * Rule 17i (history import D1): the `from` "Todo o histórico" sends, earlier than any class the app
 * can hold. The server raises it to the coach's first class (`presence_overview_service.ALL_HISTORY_FROM`
 * is the same date), so the trend is bucketed over the real history and no season row is needed.
 */
export const ALL_HISTORY_FROM = "2020-01-01";

export interface PresencePeriod {
  from: string;
  to: string;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The shortcuts to offer, in order: "Esta época" only when the coach has a current season; "Todo o histórico" last. */
export function presencePeriodShortcuts(
  season: SeasonOccurrenceRange | null = null
): PresencePeriodShortcut[] {
  return season
    ? ["thisWeek", "thisMonth", "lastMonth", "season", "all"]
    : ["thisWeek", "thisMonth", "lastMonth", "all"];
}

/**
 * The bounds of a shortcut on the club's day. `season` is the current occurrence the caller
 * already holds (`calendar.seasons`); without one the "season" shortcut has no bounds (`null`).
 */
export function presencePeriod(
  shortcut: PresencePeriodShortcut,
  now: Date = new Date(),
  season: SeasonOccurrenceRange | null = null
): PresencePeriod | null {
  if (shortcut === "season") {
    return season ? { from: season.startDate, to: season.endDate } : null;
  }
  const today = clubTodayUtcDate(now);
  if (shortcut === "all") return { from: ALL_HISTORY_FROM, to: iso(today) };
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  if (shortcut === "thisWeek") {
    // The week starts on WEEK_STARTS_ON (Sunday, calendar.view rule 5a, PAD-682).
    const back = daysSinceWeekStart(today.getUTCDay());
    return {
      from: iso(new Date(Date.UTC(y, m, d - back))),
      to: iso(new Date(Date.UTC(y, m, d - back + 6))),
    };
  }
  // Day 0 of a month is the last day of the one before.
  if (shortcut === "thisMonth") {
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
}

/** A typed from/to as a period, or `null` when `isValidCustomRange` refuses it. */
export function customPresencePeriod(from: string, to: string): PresencePeriod | null {
  return isValidCustomRange(from, to) ? { from, to } : null;
}
