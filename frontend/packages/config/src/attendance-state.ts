/**
 * One attendance state per row (PAD-313, `attendance.presence` rule 9).
 *
 * ── Why this module exists ───────────────────────────────────────────────
 *
 * A founder testing TestFlight 20 cancelled a class and the screen answered
 * with three status words at once: "presença confirmada", "falta justificada"
 * and "ausente". Three independent badges, each reading one column, and the
 * first one false — `Presence.confirmed` means *answered*, and the decline path
 * sets it true, so a cancellation rendered as a confirmation.
 *
 * The server now derives ONE state (`attendanceState`), five values, exactly one
 * true at a time. This module is the clients' only reader of it: both shells ask
 * here what state a row is in, what to call it, and how to tone it, so the web
 * and iOS renderings cannot drift the way the three badges did.
 *
 * ── What the five values mean ────────────────────────────────────────────
 *
 * While the coach has not validated, the state reports the STUDENT's intent;
 * once validated it reports the COACH's record and nothing else:
 *
 * - `planned`    — on the list, has not answered
 * - `coming`     — answered yes
 * - `not_coming` — the spot is given up and the absence is justified
 * - `attended`   — coach validated present
 * - `missed`     — coach validated absent
 *
 * `not_coming` says WHAT, never WHO (coordinator, 2026-09-12). Who gave the spot
 * up is a separate, narrower fact — `cancelledByStudent` — and it is rendered as
 * a quiet detail line on the coach's row, never as a second state word. Baking
 * provenance into a state value is how `confirmed` came to mean "answered" while
 * reading as "coming".
 */

export const ATTENDANCE_STATES = [
  "planned",
  "coming",
  "not_coming",
  "attended",
  "missed",
] as const;

export type AttendanceState = (typeof ATTENDANCE_STATES)[number];

/** Who the label is spoken to: the student about themselves, or the coach about a student. */
export type StateAudience = "student" | "coach";

/** The badge's colour family. The shells map these onto their own variants. */
export type StateTone = "neutral" | "positive" | "warning" | "negative";

/**
 * The subset of a serialized presence this module reads. Deliberately loose:
 * the payload also carries the raw columns (they stay until PAD-271 M5 drops
 * them), and nothing here may read them as status.
 */
export type AttendancePresenceLike = {
  attendanceState?: string | null;
  reminderSentAt?: string | null;
  status?: string | null;
  justification?: string | null;
  validated?: boolean | null;
  confirmed?: boolean | null;
  cancelledByStudent?: boolean | null;
  cancelledAt?: string | null;
};

function isAttendanceState(value: unknown): value is AttendanceState {
  return typeof value === "string" && (ATTENDANCE_STATES as readonly string[]).includes(value);
}

/**
 * Derive the state from the raw columns, for a payload served before the field
 * existed (one release of overlap) or by a surface that has not been updated.
 *
 * The ordering IS the fix: `validated` first, then the absence, and `confirmed`
 * only last. Testing `confirmed` first is precisely the defect — it cannot tell
 * a yes from a no, because both answers set it.
 */
function derive(presence: AttendancePresenceLike): AttendanceState {
  const absent = presence.status === "absent";
  const present = presence.status === "present";

  if (presence.validated === true) {
    if (present) return "attended";
    if (absent) return "missed";
    return "planned";
  }

  if (absent) {
    // `not_coming` asserts the absence is justified, so an unjustified one
    // cannot borrow that word; it is reported as the absence it is.
    return presence.justification === "justified" ? "not_coming" : "missed";
  }
  if (present) return "coming";
  return presence.confirmed === true ? "coming" : "planned";
}

/**
 * The state of one row: the server's field when it serves a value this client
 * knows, otherwise derived from the columns.
 *
 * An unknown string is NOT passed through — a client that renders a value it has
 * no label for would print a raw token at the user, and a stale client must not
 * decide what a new server value means.
 */
export function attendanceStateOf(
  presence: AttendancePresenceLike | null | undefined
): AttendanceState {
  if (!presence) return "planned";
  if (isAttendanceState(presence.attendanceState)) return presence.attendanceState;
  return derive(presence);
}

/**
 * The i18n key for the state word. Two audiences because the same fact is
 * spoken differently: the student reads "Vais", the coach reads "Vai".
 */
export function attendanceStateLabelKey(
  state: AttendanceState,
  audience: StateAudience
): string {
  return `calendar.attendanceState.${state}.${audience}`;
}

/** The badge tone, so the colour cannot contradict the word. */
export function attendanceStateTone(state: AttendanceState): StateTone {
  switch (state) {
    case "coming":
    case "attended":
      return "positive";
    case "not_coming":
      return "warning";
    case "missed":
      return "negative";
    case "planned":
    default:
      return "neutral";
  }
}

/**
 * The cancellation provenance line for the coach's row: who gave the spot up and
 * when (PAD-288 `attendance.confirm` rule 23). A detail, never a state word, and
 * never on the student's own row — they know they cancelled.
 *
 * Returns null once the coach has validated: from that point the row reports the
 * coach's record, and how the absence came about is no longer what the row says.
 */
export function cancellationDetail(
  presence: AttendancePresenceLike | null | undefined,
  audience: StateAudience
): { key: string; when: string } | null {
  if (!presence || audience !== "coach") return null;
  if (presence.validated === true) return null;
  if (presence.cancelledByStudent !== true) return null;
  if (!presence.cancelledAt) return null;
  return { key: "calendar.detail.cancelledByStudentAt", when: presence.cancelledAt };
}

/**
 * B-017's "reminder sent" signal, demoted from a badge to a conditional detail
 * line (`calendar.event-detail` rule 3a as amended by PAD-313).
 *
 * It renders ONLY while the state is `planned`: it answers "have they been asked
 * yet?", which is an open question only while nobody has answered. On any other
 * state it is noise beside the state word, and a spare line on a row is how a
 * second badge grows back. `planned` with no reminder returns null, and that
 * absence is itself the signal a coach acts on.
 */
export function reminderHint(
  presence: AttendancePresenceLike | null | undefined
): string | null {
  if (!presence || !presence.reminderSentAt) return null;
  if (attendanceStateOf(presence) !== "planned") return null;
  return "calendar.attendanceState.reminderSent";
}
