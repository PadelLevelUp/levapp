/**
 * The reminder answer path, pulled out of `MessageBubble` so a unit test can
 * reach it (mirrors iOS's `reminder-state.ts`).
 *
 * The tap is a request, not the outcome. The server can answer:
 * - `confirmed` / `declined` — recorded, paint the badge;
 * - `expired` (PAD-68) — refused, paint nothing and say why;
 * - `not_enrolled` (PAD-259, classes.instance-enrollment rule 7) — the student
 *   was taken off that date after the reminder went out; the answer sits on the
 *   reminder attempt and nobody was enrolled. Settle the bubble, never "absent".
 */

export type ReminderLocalResponse = "accepted" | "declined" | "not_enrolled";

export type ReminderAnswerOutcome = {
  /** What to paint locally, or `null` to leave the bubble as it was. */
  local: ReminderLocalResponse | null;
  /** An error toast key, or `null`. */
  toastKey: string | null;
};

export function reminderAnswerOutcome(action: string | null | undefined): ReminderAnswerOutcome {
  if (action === "confirmed") return { local: "accepted", toastKey: null };
  if (action === "declined") return { local: "declined", toastKey: null };
  if (action === "expired") return { local: null, toastKey: "messages.reminderExpired" };
  if (action === "not_enrolled") return { local: "not_enrolled", toastKey: null };
  // Unknown action: the server did not say what it recorded, so paint nothing.
  return { local: null, toastKey: "messages.somethingWentWrong" };
}

export type ReminderMetadataLike = {
  responded?: boolean;
  response?: string;
} | null | undefined;

export type ReminderRecordedState = {
  confirmed: boolean;
  declined: boolean;
  notEnrolled: boolean;
};

/** Which settled state a reminder is in, from this session's answer or the recorded one. */
export function reminderRecordedState(
  metadata: ReminderMetadataLike,
  localResponse: ReminderLocalResponse | "expired" | null
): ReminderRecordedState {
  const alreadyResponded = !!metadata?.responded;
  const confirmed =
    localResponse === "accepted" ||
    (localResponse === null && alreadyResponded && metadata?.response === "yes");
  const notEnrolled =
    localResponse === "not_enrolled" ||
    (localResponse === null && alreadyResponded && metadata?.response === "not_enrolled");
  // Same asymmetry as before: any recorded answer that is not "yes" reads as
  // declined, so an unrecognised value fails safe to absent — except the one
  // the server explicitly calls not_enrolled.
  const declined =
    !notEnrolled &&
    (localResponse === "declined" ||
      (localResponse === null && alreadyResponded && metadata?.response !== "yes"));
  return { confirmed, declined, notEnrolled };
}
