/**
 * The Mês grid — calendar.mobile-views rules 15–16 (PAD-248).
 *
 * Every day of every week that touches the month, Monday first, so the grid
 * is always whole weeks (four to six rows). Shared by web and iOS, and by
 * `useCalendar`, whose `monthRange` is what both shells fetch.
 */
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Locale } from "date-fns";

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MonthGrid {
  /** First day of the month the grid shows. */
  monthStart: Date;
  /** First day in the grid (a week start, possibly in the previous month). */
  start: Date;
  /** Last day in the grid (a week end, possibly in the next month), at 00:00. */
  end: Date;
  /** Every day from `start` to `end`, inclusive. */
  days: Date[];
}

export function buildMonthGrid(anchor: Date, weekStartsOn: WeekStart = 1): MonthGrid {
  const monthStart = startOfMonth(anchor);
  const start = startOfWeek(monthStart, { weekStartsOn });
  const end = startOfDay(endOfWeek(endOfMonth(monthStart), { weekStartsOn }));
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return { monthStart, start, end, days };
}

/** Rule 16: only the month's own days are tappable; the rest are dimmed. */
export function isInMonth(day: Date, monthStart: Date): boolean {
  return isSameMonth(day, monthStart);
}

/**
 * Rule 15: "Setembro 2026" / "September 2026". date-fns writes Portuguese
 * month names in lower case; the design capitalises the label.
 */
export function formatMonthLabel(date: Date, locale: Locale): string {
  const label = format(date, "LLLL yyyy", { locale });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
