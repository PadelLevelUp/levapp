/**
 * classes.class-requests (PAD-104): the start times a student can pick inside
 * one of the coach's free blocks, for a class of `durationMin` minutes, on a
 * `stepMin` grid. Pure so both shells render the same choices.
 */
export interface SlotWindow {
  startTime: string;
  endTime: string;
}

export const CLASS_REQUEST_DURATIONS = [60, 90, 120] as const;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function hhmmOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function slotOptions(block: SlotWindow, durationMin: number, stepMin = 30): SlotWindow[] {
  const start = minutesOf(block.startTime);
  const end = minutesOf(block.endTime);
  const out: SlotWindow[] = [];
  for (let s = start; s + durationMin <= end; s += stepMin) {
    out.push({ startTime: hhmmOf(s), endTime: hhmmOf(s + durationMin) });
  }
  return out;
}

/** The number of days ahead the booking form looks for its default date (rule 11). */
export const FIRST_FREE_DAY_HORIZON_DAYS = 14;

/**
 * classes.class-requests rule 11 (PAD-302): the date the booking form opens on —
 * today when today still has a free block, else the earliest later day with
 * one; today again when nothing in `blocks` is free (the picker then shows its
 * "no free time" state on today rather than jumping to an arbitrary day).
 * Dates are the calendar's own `YYYY-MM-DD` strings, so they compare as text.
 */
export function firstFreeDay(blocks: ReadonlyArray<{ date: string }>, today: string): string {
  let best: string | null = null;
  for (const b of blocks) {
    if (b.date < today) continue;
    if (best === null || b.date < best) best = b.date;
  }
  return best ?? today;
}
