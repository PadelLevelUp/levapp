/**
 * Class-overlap detection (PAD-99, shared by PAD-159).
 *
 * SINGLE SOURCE OF TRUTH for "does this class clash with an existing one".
 * It lived in `apps/web/src/lib/calendarOverlap.ts` until PAD-159 needed the
 * same gate on iOS; the two shells have drifted on exactly this kind of check
 * before, so it is shared rather than ported.
 *
 * Like the rest of `@levelup/config`, this takes minimal structural shapes
 * instead of importing `@levelup/types`, which keeps the package free of
 * domain-model coupling.
 */

export interface OverlapCandidate {
  /** Day of the class. Accepts "YYYY-MM-DD" or an ISO string — normalized here. */
  date: string;
  /** Start time-of-day, "HH:MM". */
  startTime: string;
  /** End time-of-day, "HH:MM". */
  endTime: string;
}

/** The little a calendar event has to expose to be checked for a clash. */
export interface OverlapEventLike {
  id: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Normalize any date value to its "YYYY-MM-DD" day key. */
const dayKey = (date: string): string => (date ?? "").slice(0, 10);

/**
 * Find the first existing event whose [start, end) interval on the same day
 * intersects the candidate's [start, end) interval.
 *
 * Half-open intervals mean adjacent events (one ends exactly when the next
 * starts, e.g. 10:00–11:00 then 11:00–12:00) do NOT count as an overlap —
 * warning on a normal consecutive pair would cry wolf all day.
 *
 * Generic in the event type so a caller gets its own richer event back rather
 * than this module's minimal shape.
 *
 * @param excludeId  id of the event being edited, so a class never conflicts
 *                   with itself.
 * @returns the first overlapping event, or `null` when the slot is free.
 */
export function findOverlappingEvent<T extends OverlapEventLike>(
  candidate: OverlapCandidate,
  events: T[],
  excludeId?: string
): T | null {
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
