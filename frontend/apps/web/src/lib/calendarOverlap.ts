import type { CalendarEvent } from "@/types";

export interface OverlapCandidate {
  /** Day of the class. Accepts "YYYY-MM-DD" or an ISO string — normalized here. */
  date: string;
  /** Start time-of-day, "HH:MM". */
  startTime: string;
  /** End time-of-day, "HH:MM". */
  endTime: string;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Normalize any date value to its "YYYY-MM-DD" day key. */
const dayKey = (date: string): string => (date ?? "").slice(0, 10);

/**
 * PAD-99: find the first existing event whose [start, end) interval on the same
 * day intersects the candidate's [start, end) interval.
 *
 * Half-open intervals mean adjacent events (one ends exactly when the next
 * starts, e.g. 10:00–11:00 then 11:00–12:00) do NOT count as an overlap.
 *
 * @param excludeId  id of the event being edited, so a class never conflicts
 *                   with itself.
 * @returns the first overlapping event, or `null` when the slot is free.
 */
export function findOverlappingEvent(
  candidate: OverlapCandidate,
  events: CalendarEvent[],
  excludeId?: string
): CalendarEvent | null {
  if (!candidate?.date || !candidate.startTime || !candidate.endTime) {
    return null;
  }

  const cDay = dayKey(candidate.date);
  const cStart = toMinutes(candidate.startTime);
  const cEnd = toMinutes(candidate.endTime);
  // Ignore zero-length or inverted intervals — nothing meaningful to compare.
  if (!(cStart < cEnd)) return null;

  for (const ev of events) {
    if (excludeId && ev.id === excludeId) continue;
    if (!ev.startTime || !ev.endTime) continue;
    if (dayKey(ev.date) !== cDay) continue;

    const eStart = toMinutes(ev.startTime);
    const eEnd = toMinutes(ev.endTime);
    if (cStart < eEnd && eStart < cEnd) return ev;
  }

  return null;
}
