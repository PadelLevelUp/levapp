/**
 * classes.availability (PAD-357) — the ONE computation of "when is a private
 * class possible" for a coach and a set of people, shared by web and iOS.
 *
 * The server subtracts everyone's calendars (it holds the private inputs) and
 * serves `freeWindows` per date; the shells render those through this module —
 * `slotStarts` for a single class, `weeklyIntersection` then `slotStarts` for a
 * weekly one — and the server re-derives the same arithmetic when the request is
 * submitted. Pure, structural inputs, HH:MM strings in and out, so both shells
 * and the backend's tests can agree on one answer.
 */
import { hhmmOf, minutesOf, slotOptions, type SlotWindow } from "./class-request-slots";

export type Window = SlotWindow;

export const WORKING_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WorkingDayKey = (typeof WORKING_DAY_KEYS)[number];
/** `{"mon": [["08:00","22:00"]], ...}`; a missing day = the default, an empty list = a day off. */
export type WorkingHours = Partial<Record<WorkingDayKey, [string, string][]>> | null;

/** The club's day, in force until a coach declares working hours (classes.class-requests rule 1). */
export const DEFAULT_WORKING_WINDOW: Window = { startTime: "08:00", endTime: "22:00" };

/** Minimum length of a window worth offering (a 30-minute class is the shortest request). */
export const MIN_FREE_WINDOW_MINUTES = 30;

/** The grid working hours sit on (settings.coach-working-hours rule 2; the server refuses anything else). */
export const WORKING_HOURS_GRID_MINUTES = 15;

/**
 * settings.coach-working-hours rule 6 (PAD-369, B-141): an `HH:MM` brought to the nearest
 * point of the grid, never past 23:45 (a time field cannot show 24:00). Anything that is not
 * a time — a field the coach has emptied — comes back unchanged.
 */
export function snapToGrid(hhmm: string, grid: number = WORKING_HOURS_GRID_MINUTES): string {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm;
  const snapped = Math.round(minutesOf(hhmm) / grid) * grid;
  const last = Math.floor((24 * 60 - 1) / grid) * grid;
  return hhmmOf(Math.min(snapped, last));
}

/** The break "add window" opens in a day that has no room left (settings.coach-working-hours rule 5). */
export const WORKING_BREAK: Window = { startTime: "13:00", endTime: "14:00" };
/** The shortest window "add window" creates, and the length of the break it leaves before it. */
export const ADDED_WINDOW_MINUTES = 60;

/**
 * settings.coach-working-hours rule 5 (PAD-361, B-140): the day after the coach taps
 * "add window", or null when no window fits and the control is disabled. One answer
 * for web and iOS, and always a day the server accepts (rule 2): the editors used to
 * append `[last end, 22:00]`, which on an untouched 08:00–22:00 day is 22:00–22:00.
 *
 * 1. Room after the last window: a new window from one hour after it ends to the
 *    default day's end, when that leaves at least an hour.
 * 2. Otherwise the last window splits around a one-hour break: lunch (13:00–14:00)
 *    when it sits inside the window with an hour on each side, else the window's
 *    middle, on the 15-minute grid.
 * 3. Otherwise (the last window is under three hours, or is not start < end): null.
 */
export function addWorkingWindow(windows: ReadonlyArray<readonly [string, string]>): [string, string][] | null {
  const day = windows.map(([s, e]) => [s, e] as [string, string]);
  if (day.length === 0) return [[DEFAULT_WORKING_WINDOW.startTime, DEFAULT_WORKING_WINDOW.endTime]];

  const [lastStart, lastEnd] = day[day.length - 1];
  const s = minutesOf(lastStart);
  const e = minutesOf(lastEnd);
  const dayEnd = minutesOf(DEFAULT_WORKING_WINDOW.endTime);
  const gap = ADDED_WINDOW_MINUTES;

  if (s < e && dayEnd - (e + gap) >= gap) return [...day, [hhmmOf(e + gap), DEFAULT_WORKING_WINDOW.endTime]];

  const lunchStart = minutesOf(WORKING_BREAK.startTime);
  const lunchEnd = minutesOf(WORKING_BREAK.endTime);
  let breakStart: number | null = null;
  if (s + gap <= lunchStart && lunchEnd + gap <= e) breakStart = lunchStart;
  else if (e - s >= 3 * gap) breakStart = s + Math.floor((e - s - gap) / 2 / 15) * 15;
  if (breakStart === null) return null;

  return [...day.slice(0, -1), [lastStart, hhmmOf(breakStart)], [hhmmOf(breakStart + gap), lastEnd]];
}

type Interval = readonly [number, number];

const toIntervals = (windows: ReadonlyArray<Window>): Interval[] =>
  windows
    .map((w) => [minutesOf(w.startTime), minutesOf(w.endTime)] as Interval)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

const toWindows = (intervals: ReadonlyArray<Interval>): Window[] =>
  intervals.map(([s, e]) => ({ startTime: hhmmOf(s), endTime: hhmmOf(e) }));

/** The coach's working windows for a weekday (1 = Monday … 7 = Sunday). */
export function workingWindowsFor(workingHours: WorkingHours, weekday: number): Window[] {
  const key = WORKING_DAY_KEYS[((weekday - 1) % 7 + 7) % 7];
  const day = workingHours?.[key];
  if (day === undefined) return [DEFAULT_WORKING_WINDOW];
  return day.map(([startTime, endTime]) => ({ startTime, endTime }));
}

/** `windows` minus `busy`, half-open on the minute: a class ending at 10:00 leaves 10:00 free. */
export function subtractIntervals(windows: ReadonlyArray<Window>, busy: ReadonlyArray<Window>): Window[] {
  let free = toIntervals(windows);
  for (const [bs, be] of toIntervals(busy)) {
    const next: Interval[] = [];
    for (const [s, e] of free) {
      if (be <= s || bs >= e) {
        next.push([s, e]);
        continue;
      }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    free = next;
  }
  return toWindows(free);
}

/**
 * The windows in which the coach AND every person are free on one day:
 * `working` minus every interval of every person, dropping leftovers shorter
 * than `minMinutes`.
 */
export function freeWindowsForDay(
  working: ReadonlyArray<Window>,
  busyByPerson: ReadonlyArray<ReadonlyArray<Window>>,
  opts: { minMinutes?: number } = {},
): Window[] {
  const min = opts.minMinutes ?? MIN_FREE_WINDOW_MINUTES;
  const free = busyByPerson.reduce<Window[]>((acc, busy) => subtractIntervals(acc, busy), [...working]);
  return free.filter((w) => minutesOf(w.endTime) - minutesOf(w.startTime) >= min);
}

export interface Recurrence {
  /** 1 = Monday … 7 = Sunday, the app's weekday convention. */
  weekdays: number[];
  startDate: string;
  endDate: string;
}

const isoWeekday = (date: string): number => {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
};

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Every date of the recurrence, in order, startDate and endDate inclusive. */
export function occurrenceDates(rec: Recurrence): string[] {
  const wanted = new Set(rec.weekdays);
  const out: string[] = [];
  for (let day = rec.startDate; day <= rec.endDate; day = addDays(day, 1)) {
    if (wanted.has(isoWeekday(day))) out.push(day);
  }
  return out;
}

const intersectTwo = (a: ReadonlyArray<Interval>, b: ReadonlyArray<Interval>): Interval[] => {
  const out: Interval[] = [];
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
};

/**
 * The windows free on EVERY occurrence date of the recurrence, so a weekly
 * class fits every week. A date absent from `freeWindowsByDate` counts as fully
 * busy (the server omits days it did not compute). `dates` says which
 * occurrences were considered.
 */
export function weeklyIntersection(
  freeWindowsByDate: Readonly<Record<string, ReadonlyArray<Window>>>,
  rec: Recurrence,
): { windows: Window[]; dates: string[] } {
  const dates = occurrenceDates(rec);
  if (dates.length === 0) return { windows: [], dates };
  let common: Interval[] | null = null;
  for (const date of dates) {
    const today = toIntervals(freeWindowsByDate[date] ?? []);
    common = common === null ? today : intersectTwo(common, today);
    if (common.length === 0) break;
  }
  return { windows: toWindows(common ?? []), dates };
}

/** The start times a class of `durationMin` fits in, on a `stepMin` grid. */
export function slotStarts(windows: ReadonlyArray<Window>, durationMin: number, stepMin = 30): Window[] {
  return windows.flatMap((w) => slotOptions(w, durationMin, stepMin));
}
