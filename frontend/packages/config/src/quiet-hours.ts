/**
 * notifications.config rule 6a (PAD-451): the coach's quiet window, shared by web and iOS so both
 * pickers offer the same half-hour choices and refuse what the server refuses (400). Bounds are
 * "HH:00" / "HH:30" on the club's clock; the window is [start, end) and may cross midnight.
 */
export interface QuietWindow {
  start: string;
  end: string;
}

export const QUIET_HOURS_DEFAULT: QuietWindow = { start: "22:00", end: "07:00" };

/** The pickers' step: 30 minutes (web `<input type="time" step>` takes seconds). */
export const QUIET_HOURS_STEP_SECONDS = 1800;

/** Every half hour of the day, "00:00" … "23:30". */
export const QUIET_HOURS_STEPS: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

const STEP_SET = new Set(QUIET_HOURS_STEPS);

/** A window the server accepts: both bounds on the 30-minute grid, and not empty. */
export function isValidQuietWindow(start: string, end: string): boolean {
  return STEP_SET.has(start) && STEP_SET.has(end) && start !== end;
}

/** The window a config carries, with a missing or malformed bound read as the default. */
export function quietWindowOf(q: { start?: string | null; end?: string | null } | null | undefined): QuietWindow {
  const start = q?.start && STEP_SET.has(q.start) ? q.start : QUIET_HOURS_DEFAULT.start;
  const end = q?.end && STEP_SET.has(q.end) ? q.end : QUIET_HOURS_DEFAULT.end;
  return { start, end };
}
