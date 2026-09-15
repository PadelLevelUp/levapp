/**
 * What the server answered, and what the client should do about it
 * (`attendance.confirm` rule 26, PAD-315; ledger B-074).
 *
 * ── Why this is shared ───────────────────────────────────────────────────
 *
 * `POST /api/app/notify/respond_reminder` answers five things, and four call
 * sites each decided for themselves what to do with three of them. When the
 * server gained `spot_filled` — a return refused because the seat had gone —
 * their defensive defaults did not ignore it, they asserted something false:
 * the mobile conversation bubble recorded the student as having answered "no",
 * silently, and the mobile dashboard toasted "declined" as a success. A student
 * asked for their spot back and was told they had declined.
 *
 * So the mapping lives here once, and its unknown branch writes NOTHING. The
 * rule, which is worth more than this module: **when you cannot tell, say
 * nothing rather than guess the common case.**
 */
import type { AttendanceState } from "./attendance-state";

/** The shape `respondToReminder` resolves to. `duplicate` marks a repeat tap. */
export type ReminderServerAnswer = {
  action?: string | null;
  duplicate?: boolean;
  proactive?: boolean;
};

/** What settles on the row, or `null` when the client must write nothing. */
export type AnswerRecord = "confirmed" | "declined" | "not_enrolled";

export type AnswerTone = "success" | "info" | "error";

export type AnswerOutcome = {
  /** The answer to record locally, or `null` to leave the row exactly as it was. */
  record: AnswerRecord | null;
  /** An i18n key explaining the outcome, or `null` when there is nothing to say. */
  messageKey: string | null;
  /** How to show that message. `null` whenever `messageKey` is `null`. */
  tone: AnswerTone | null;
};

const SETTLED: Record<string, AnswerRecord> = {
  confirmed: "confirmed",
  declined: "declined",
  not_enrolled: "not_enrolled",
};

/**
 * Whether to offer "actually, I can come" (rule 26).
 *
 * Deliberately takes NO capacity argument. The client cannot know whether the
 * spot is still free without racing the invitation engine, and hiding a working
 * action from a student whose seat is in fact free is worse than offering one
 * the server may refuse. Offer it, call, honour the reply.
 */
export function canComeBack(input: {
  state: AttendanceState;
  classStarted: boolean;
}): boolean {
  return input.state === "not_coming" && !input.classStarted;
}

/**
 * Map the server's answer onto what to record and what to say.
 *
 * Exhaustive by construction: anything not named below falls to the unknown
 * branch, which records nothing. An outcome either settles the row or explains
 * itself — never both.
 */
export function reminderAnswerOutcome(
  answer: ReminderServerAnswer | null | undefined
): AnswerOutcome {
  const action = answer?.action;

  // A repeat tap is success: the answer the student wanted recorded IS recorded.
  // `duplicate` rides along with the action it repeated, so it needs no branch
  // of its own — it must simply not turn a confirmation into a failure.
  if (typeof action === "string" && action in SETTLED) {
    return { record: SETTLED[action] as AnswerRecord, messageKey: null, tone: null };
  }

  // B-074: the return was refused because the seat went to somebody else. That
  // is an OUTCOME, not an error — freeing the spot is what let it happen — and
  // the row stays exactly as it was.
  if (action === "spot_filled") {
    return { record: null, messageKey: "calendar.detail.spotFilled", tone: "info" };
  }

  // PAD-68: the class already started, so nothing was recorded.
  if (action === "expired") {
    return { record: null, messageKey: "messages.reminderExpired", tone: "error" };
  }

  // The server said something this client does not know. Write nothing: a
  // client that guesses here reports a state the server never gave.
  return { record: null, messageKey: "messages.somethingWentWrong", tone: "error" };
}
