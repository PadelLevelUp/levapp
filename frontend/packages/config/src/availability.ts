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
 * point of the grid, CAPPED at the last one a time field can show — 23:45 on the 15-minute
 * grid. So 23:53–23:59 move DOWN, not to 24:00: the server accepts an end of 24:00 but
 * neither editor can express it (a web time input cannot show it, the mobile picker's
 * parser refuses it). A known limit, not an oversight: PAD-379 (B-142).
 * Anything that is not a time — an emptied field, 25:00, 09:75, a value with seconds —
 * comes back unchanged, as does any time when the grid is not a positive whole number.
 */
export function snapToGrid(hhmm: string, grid: number = WORKING_HOURS_GRID_MINUTES): string {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(hhmm) || !Number.isInteger(grid) || grid <= 0) return hhmm;
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
 * "add window", sorted by start, or null when the control is disabled. One answer for
 * web and iOS. Given a day the server accepts (rule 2), the answer is a day the server
 * accepts: the editors used to append `[last end, 22:00]`, which on an untouched
 * 08:00–22:00 day is 22:00–22:00.
 *
 * It reads the WHOLE day, not the last row — the editors never sort their rows, only
 * the server does on save (review of #347).
 *
 * 1. The largest free gap inside the default day (08:00–22:00) — before, between or
 *    after the windows — once an hour's break is kept from each neighbouring window,
 *    if an hour or more is left. The earliest wins a tie.
 * 2. Otherwise the longest window splits around a one-hour break: lunch (13:00–14:00)
 *    when it sits inside the window with an hour on each side, else the window's
 *    middle, on the 15-minute grid. It must be three hours or longer.
 * 3. Otherwise null. Null too for a day rule 2 refuses as it stands (a row that is
 *    not a time, start >= end, off the grid, overlapping): the row is fixed first.
 */
export function addWorkingWindow(windows: ReadonlyArray<readonly [string, string]>): [string, string][] | null {
  if (windows.length === 0) return [[DEFAULT_WORKING_WINDOW.startTime, DEFAULT_WORKING_WINDOW.endTime]];

  const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t === "24:00";
  if (!windows.every(([s, e]) => isTime(s) && isTime(e))) return null;
  const grid = WORKING_HOURS_GRID_MINUTES;
  const day = windows.map(([s, e]) => [minutesOf(s), minutesOf(e)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const accepted =
    day.every(([s, e]) => s % grid === 0 && e % grid === 0 && s < e) && day.every(([s], i) => i === 0 || s >= day[i - 1][1]);
  if (!accepted) return null;

  const hour = ADDED_WINDOW_MINUTES;
  const dayStart = minutesOf(DEFAULT_WORKING_WINDOW.startTime);
  const dayEnd = minutesOf(DEFAULT_WORKING_WINDOW.endTime);
  const done = (next: [number, number][]) =>
    next.sort((a, b) => a[0] - b[0]).map(([s, e]) => [hhmmOf(s), hhmmOf(e)] as [string, string]);

  // 1. The largest gap, less an hour's break beside each window it touches.
  let best: [number, number] | null = null;
  let cursor = dayStart;
  let touchesBefore = false;
  for (const [s, e] of [...day, [dayEnd, dayEnd] as [number, number]]) {
    const isDayEnd = s === dayEnd && e === dayEnd;
    const from = cursor + (touchesBefore ? hour : 0);
    const to = Math.min(s, dayEnd) - (isDayEnd ? 0 : hour);
    if (to - from >= hour && (!best || to - from > best[1] - best[0])) best = [from, to];
    if (e > cursor) { cursor = e; touchesBefore = true; }
    if (cursor >= dayEnd) break;
  }
  if (best) return done([...day, best]);

  // 2. Split the longest window around a break.
  const longest = day.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const [s, e] = longest;
  const lunchStart = minutesOf(WORKING_BREAK.startTime);
  const lunchEnd = minutesOf(WORKING_BREAK.endTime);
  let breakStart: number | null = null;
  if (s + hour <= lunchStart && lunchEnd + hour <= e) breakStart = lunchStart;
  else if (e - s >= 3 * hour) breakStart = s + Math.floor((e - s - hour) / 2 / grid) * grid;
  if (breakStart === null) return null;
  return done([...day.filter((w) => w !== longest), [s, breakStart], [breakStart + hour, e]]);
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
