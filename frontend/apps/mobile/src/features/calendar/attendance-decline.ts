import { localDateTime } from "@levelup/config";
/**
 * The student-side decline gates on the class-detail screen (PAD-170 C5,
 * `attendance.confirm` rules 10–16).
 *
 * Extracted from `app/class/[id].tsx` so the conditions can be exercised by the
 * unit runner: the screen itself is Maestro's job, but "is the proactive-decline
 * button offered right now" is a decision, not a rendering, and getting it wrong
 * either hides a spot-freeing action or offers one the server would refuse.
 *
 * Deliberately NOT re-derived here: the proactive WINDOW. That instant comes
 * from the server as `canDeclineProactively`, computed by the same helper that
 * classifies the decline, so a stale client cannot offer the action at a moment
 * `cancel_attendance` would treat differently.
 */

/** The little the student's own presence row has to expose. */
export interface OwnPresenceLike {
  status?: string | null;
  justification?: string | null;
}

export interface DeclineGateInput {
  /** A coach never sees these affordances — they are the student's own row. */
  isCoach: boolean;
  /** The class itself is cancelled; there is nothing left to decline. */
  isCanceled: boolean;
  /** The student's own presence, or undefined when they have none. */
  ownPresence: OwnPresenceLike | null | undefined;
  /** The server's answer to "is the proactive window still open". */
  canDeclineProactively?: boolean;
  /** Class day, "YYYY-MM-DD". */
  date?: string | null;
  /** Class start time-of-day, "HH:MM". */
  startTime?: string | null;
}

/**
 * Whether the student has already declined, read from the SERIALIZED presence
 * rather than from component state — which is what makes the "not attending"
 * state survive a reload with no extra column and no extra request.
 *
 * Both halves matter: `absent` alone is also how a coach marks a no-show, and
 * only a decline carries `justified`.
 */
export function hasDeclined(
  ownPresence: OwnPresenceLike | null | undefined
): boolean {
  return (
    ownPresence?.status === "absent" && ownPresence?.justification === "justified"
  );
}

/**
 * Whether the class has already started, from its own date and start time.
 *
 * A missing or unparseable value reads as "not started": the server flag still
 * gates the action, and refusing to show it on a date we simply could not parse
 * would silently remove the affordance.
 */
export function hasClassStarted(
  date: string | null | undefined,
  startTime: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!date) return false;
  // B-060: built from its parts. Hermes may return Invalid Date for an
  // offset-less "YYYY-MM-DDTHH:MM" string, which read as "not started".
  const startAt = localDateTime(date, startTime || "00:00");
  const ms = startAt.getTime();
  return !Number.isNaN(ms) && ms <= now;
}

/**
 * Whether to offer the proactive decline — the affordance that frees the spot
 * early enough for the invitation engine to refill it.
 *
 * Once the window closes this goes false and `canCancelAttendance` below is the
 * remaining way to decline (a normal or late cancellation).
 */
export function canDeclineProactively(
  input: DeclineGateInput,
  now: number = Date.now()
): boolean {
  return (
    !input.isCoach &&
    !input.isCanceled &&
    input.ownPresence != null &&
    !hasDeclined(input.ownPresence) &&
    input.canDeclineProactively === true &&
    !hasClassStarted(input.date, input.startTime, now)
  );
}

/**
 * Whether to offer the plain cancel-attendance action. Unlike the proactive
 * decline this is NOT gated on the window or on the class having started — it
 * is the existing behaviour and stays exactly as it was, so a student can still
 * cancel late.
 */
export function canCancelAttendance(input: DeclineGateInput): boolean {
  return (
    !input.isCoach &&
    !input.isCanceled &&
    input.ownPresence != null &&
    input.ownPresence.status !== "absent"
  );
}
