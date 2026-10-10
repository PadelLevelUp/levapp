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
 * Whether to offer "Vou" on the class detail (`attendance.confirm` rule 27, PAD-570).
 *
 * Deliberately takes the SERVER's `pendingConfirmation` and never a date: the ask
 * (the reminder instant, or a reminder the coach sent by hand) is computed in one
 * place on the server and this gate cannot re-derive it. `not_coming` is final
 * (rule 28) — the PAD-315 `canComeBack` that lived here is gone with it.
 */
export function canConfirmAttendance(input: {
  state: AttendanceState;
  pendingConfirmation: boolean | null | undefined;
  classStarted: boolean;
}): boolean {
  return input.state === "planned" && input.pendingConfirmation === true && !input.classStarted;
}

/** What a dashboard row, hero or card offers a student (`dashboard.blocks` rule 3a). */
export type StudentRowAction = "answer" | "decline" | "declined" | "none";

/**
 * - `answer`: Yes / No — the server says the student is asked (`pendingConfirmation`).
 * - `decline`: one "Avisar que não vou" — not asked yet, or already coming.
 * - `declined`: no button, the hint pointing to the coach's chat — "Não vou" is final.
 * - `none`: the coach's record stands (attended / missed).
 * A settled state always beats a stale flag; an absent state reads as `planned`.
 */
export function studentRowAction(input: {
  pendingConfirmation?: boolean | null;
  attendanceState?: AttendanceState | null;
}): StudentRowAction {
  const state = input.attendanceState ?? "planned";
  if (state === "not_coming") return "declined";
  if (state === "attended" || state === "missed") return "none";
  if (state === "planned" && input.pendingConfirmation === true) return "answer";
  return "decline";
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

  // PAD-570 (attendance.confirm rules 27-29): a "yes" the server would not take.
  // Nothing was recorded; the screen says why, in the student's own words.
  if (action === "not_yet_asked") {
    return { record: null, messageKey: "calendar.detail.notYetAsked", tone: "info" };
  }
  if (action === "already_declined") {
    return { record: null, messageKey: "calendar.detail.declinedFinalHint", tone: "info" };
  }
  if (action === "already_marked") {
    return { record: null, messageKey: "calendar.detail.alreadyMarked", tone: "info" };
  }

  // PAD-68: the class already started, so nothing was recorded.
  if (action === "expired") {
    return { record: null, messageKey: "messages.reminderExpired", tone: "error" };
  }

  // The server said something this client does not know. Write nothing: a
  // client that guesses here reports a state the server never gave.
  return { record: null, messageKey: "messages.somethingWentWrong", tone: "error" };
}

/**
 * B-542 (attendance.confirm rule 27, PAD-600): the live event that means "the coach's
 * reminder for the open occurrence just landed". The server publishes the reminder as
 * `message_created` with the serialized message; `messageType` names it and
 * `metadata.lessonInstanceId` (or the older `instanceId`) names the occurrence. Both shells
 * ask this one predicate before refetching the class detail — never their own string match.
 */
export function reminderArrivedFor(
  evt: { type?: unknown; payload?: unknown } | null | undefined,
  instanceId: number | string | null | undefined
): boolean {
  if (!evt || evt.type !== "message_created" || instanceId == null) return false;
  const payload = evt.payload as { messageType?: unknown; metadata?: unknown } | null | undefined;
  if (!payload || payload.messageType !== "notification_reminder") return false;
  const meta = payload.metadata as { lessonInstanceId?: unknown; instanceId?: unknown } | null | undefined;
  const raw = meta?.lessonInstanceId ?? meta?.instanceId;
  if (raw == null) return false;
  return String(raw) === String(instanceId);
}
