/**
 * The continuous Dia — calendar.mobile-views rule 26. The pure rules that `useDayList` and both screens
 * share: which day is at the top, what is read and when, and which class is "next". Platform-neutral;
 * the clock is always passed in, so nothing here owns a timer.
 */
import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import type { CalendarEvent } from "@levelup/types";
import { findNextEventId } from "./calendar-status";
import { lisbonNow } from "./club-date";
import { WEEK_STARTS_ON } from "./week-start";

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Rule 26b: a movement inside the loaded range lasts one second at most. */
export const DAY_LIST_MOVE_LIMIT_MS = 1000;
/** Rule 26c: the first read is whole weeks, this many before the selected day's week… */
export const DAY_LIST_WEEKS_BEFORE = 2;
/** …and this many after it (7 weeks in all, with the selected day's own). */
export const DAY_LIST_WEEKS_AFTER = 4;
/** Rule 26c: near the end it reads this many more weeks, once. */
export const DAY_LIST_TAIL_WEEKS = 4;

/** A list's position: where each day's section starts. `top` grows down the list. */
export interface DayListPosition {
  date: string;
  top: number;
}

/**
 * The selected day while the list scrolls (rules 26a, 26b): the day whose section holds the list's top — unless
 * a target is in progress, which stays selected BEFORE and while the list moves to it. A target inside the
 * loaded days gives way to the day at the top after a touch or a second; a target outside them holds until its
 * read is on screen (the caller clears it), because the old days under the list's own scroll select nothing.
 */
export function dayListDayAtTop(input: {
  days: readonly DayListPosition[];
  offset: number;
  target?: string | null;
  touched?: boolean;
  elapsedMs?: number;
}): string | null {
  const { days, offset, target = null, touched = false, elapsedMs = 0 } = input;
  if (target) {
    const loaded = days.some((d) => d.date === target);
    if (!loaded) return target;
    if (!touched && elapsedMs < DAY_LIST_MOVE_LIMIT_MS) return target;
  }
  if (days.length === 0) return null;
  let top = days[0].date;
  for (const d of days) {
    if (d.top <= offset) top = d.date;
    else break;
  }
  return top;
}

export interface DayListRange {
  /** A week start, at 00:00. */
  start: Date;
  /** A week's last day, at 00:00. */
  end: Date;
}

/**
 * Rule 26c: what Dia reads for a selected day. `first` is whole weeks, 2 before the selected day's week to
 * 4 after it (7 weeks); `tail` is the next 4 weeks. Nothing is ever added above `first`.
 */
export function dayListRanges(
  selected: Date,
  weekStartsOn: WeekStart = WEEK_STARTS_ON
): { first: DayListRange; tail: DayListRange } {
  const week = startOfWeek(selected, { weekStartsOn });
  const start = addWeeks(week, -DAY_LIST_WEEKS_BEFORE);
  const end = addDays(addWeeks(week, DAY_LIST_WEEKS_AFTER), 6);
  return {
    first: { start, end },
    tail: { start: addDays(end, 1), end: addWeeks(end, DAY_LIST_TAIL_WEEKS) },
  };
}

/** The `from` / `to` strings the shells send for a range (the calendar read's format). */
export function dayListReadParams(range: DayListRange): { from: string; to: string } {
  return {
    from: format(range.start, "yyyy-MM-dd'T'00:00:00"),
    to: format(range.end, "yyyy-MM-dd'T'23:59:59"),
  };
}

/** Rule 26c: within one week of the end of the first read (its last 7 days), the tail is due. */
export function dayListTailDue(
  selected: Date,
  ranges: { first: DayListRange }
): boolean {
  return selected.getTime() >= addDays(ranges.first.end, -6).getTime();
}

/**
 * Rule 26c: the day the two edge rows ("Semanas anteriores" / "Semanas seguintes") reopen the list on: the
 * first day of the week just outside what is loaded. `loaded` is the span on screen.
 */
export function dayListEdges(
  loaded: DayListRange,
  weekStartsOn: WeekStart = WEEK_STARTS_ON
): { before: Date; after: Date } {
  return {
    before: startOfWeek(addDays(loaded.start, -1), { weekStartsOn }),
    after: addDays(loaded.end, 1),
  };
}

/** Whether `day` falls inside `range` (both ends included). */
export function dayListCovers(range: DayListRange, day: Date): boolean {
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/**
 * Rule 26e: the next class is searched in the week that holds today, as Semana does, so the two modes never
 * outline different classes. `events` may hold every loaded week.
 */
export function nextClassIdInTodayWeek(
  events: CalendarEvent[],
  now: Date = new Date(),
  weekStartsOn: WeekStart = WEEK_STARTS_ON
): string | undefined {
  // `now` is a real instant; the club's day is read the way `findNextEventId` reads it.
  const todayClub = format(lisbonNow(now), "yyyy-MM-dd");
  const week = startOfWeek(parseISO(todayClub), { weekStartsOn });
  const first = format(week, "yyyy-MM-dd");
  const last = format(addDays(week, 6), "yyyy-MM-dd");
  return findNextEventId(
    events.filter((e) => e.date >= first && e.date <= last),
    now
  );
}
