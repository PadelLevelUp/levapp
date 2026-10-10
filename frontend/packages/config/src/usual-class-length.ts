/**
 * PAD-559 (`classes.create` rule 8c): the coach's usual class length, for suggesting an end time.
 *
 * The median length of the classes already on the calendar the sheet opened from, rounded to the
 * quarter hour; 60 minutes when there are none. A median, not a mean: one 3-hour clinic must not
 * drag every suggestion. Shared by web (`TimeSelect` callers) and iOS (`class/new.tsx`).
 */
export const DEFAULT_CLASS_MINUTES = 60;

const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
const HHMM = /^\d{2}:\d{2}$/;

export function usualClassMinutes(
  events: ReadonlyArray<{ type?: string | null; startTime?: string | null; endTime?: string | null }>
): number {
  const lengths = events
    .filter((e) => (e.type ?? "class") === "class" && e.startTime && e.endTime && HHMM.test(e.startTime) && HHMM.test(e.endTime))
    .map((e) => toMinutes(e.endTime as string) - toMinutes(e.startTime as string))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (lengths.length === 0) return DEFAULT_CLASS_MINUTES;
  const mid = Math.floor(lengths.length / 2);
  const median = lengths.length % 2 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
  return Math.max(15, Math.round(median / 15) * 15);
}

/** `start` plus `minutes`, never past 23:59; "" stays "". */
export function endFromUsualLength(start: string, minutes: number): string {
  if (!HHMM.test(start)) return "";
  const total = Math.min(toMinutes(start) + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
