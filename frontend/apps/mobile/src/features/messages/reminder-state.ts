/**
 * What an attendance-reminder message offers the student (PAD-151).
 *
 * Mirrors the derivation web's `MessageBubble` does inline for
 * `messageType === "notification_reminder"`. iOS handled only
 * `notification_invite`, so a reminder rendered with no buttons at all and a
 * student could not answer from the app.
 *
 * The rules here are not obvious and each came from its own ticket, so they
 * are pulled out where a unit test can reach them rather than living inside
 * JSX a screen test would have to drive.
 */

export type ReminderMetadata = {
  responded?: boolean;
  response?: string;
  /** ISO datetime the class starts. */
  startsAt?: string;
  /** ISO datetime after which cancelling counts as late (PAD-46). */
  cancellationDeadline?: string;
  /** A newer reminder for the same class replaced this one (PAD-49). */
  superseded?: boolean;
};

export type ReminderState = {
  /** The student answered yes — show the confirmed badge. */
  confirmed: boolean;
  /** The student answered no — show the absent badge. */
  declined: boolean;
  /** No longer answerable; show the expired badge instead of buttons. */
  superseded: boolean;
  /** Whether a cancel action should be offered at all. */
  canCancel: boolean;
  /** Cancelling now counts as a late cancellation — warn first (PAD-46). */
  isLateCancellation: boolean;
  /** Nothing answered yet and still answerable: show Yes/No. */
  showResponseButtons: boolean;
};

/**
 * Derive the reminder's state.
 *
 * @param metadata  the message's metadata
 * @param localResponse  an answer given in this session, before the server
 *                       round-trip is reflected back in metadata
 * @param now  injectable clock, so the time-based rules are testable
 */
export function reminderState(
  metadata: ReminderMetadata | null | undefined,
  localResponse: "accepted" | "declined" | null = null,
  now: Date = new Date()
): ReminderState {
  const alreadyResponded = !!metadata?.responded;

  const confirmed =
    localResponse === "accepted" ||
    (localResponse === null && alreadyResponded && metadata?.response === "yes");

  // Note the asymmetry, which matches web: any recorded answer that is not
  // "yes" reads as declined, so an unrecognised value fails safe to absent
  // rather than showing a confirmation the student never gave.
  const declined =
    localResponse === "declined" ||
    (localResponse === null && alreadyResponded && metadata?.response !== "yes");

  const startsAt = metadata?.startsAt;
  // Cancellation is only offered while the class is still ahead.
  const classInFuture = !startsAt || new Date(startsAt).getTime() > now.getTime();

  // PAD-49: a newer reminder for the same class supersedes this one, so its
  // Yes/No stops being actionable. PAD-68: a reminder for a class that has
  // already started is expired for the same reason — answering can no longer
  // change anything and the backend rejects late responses. Deriving it from
  // startsAt also retires reminders already sitting in history, with no data
  // migration.
  const superseded = !!metadata?.superseded || !classInFuture;

  // PAD-46: past the coach's deadline (but before the class starts) cancelling
  // is still allowed, but it counts as a late cancellation and is warned
  // about. Absent on older reminders → no warning, exactly as before.
  const deadlineIso = metadata?.cancellationDeadline;
  const isLateCancellation =
    !!deadlineIso && new Date(deadlineIso).getTime() <= now.getTime();

  return {
    confirmed,
    declined,
    superseded,
    canCancel: confirmed && classInFuture,
    isLateCancellation,
    showResponseButtons: !confirmed && !declined && !superseded,
  };
}

/**
 * What to do with the action the server returned for a reminder answer.
 *
 * The tap is a request, not the outcome: the backend refuses an answer to a
 * class that has already started (PAD-68) and records nothing. Writing the
 * tapped choice into the cache in that case paints an "Absent" badge for an
 * answer that does not exist. Web decides this inline in `MessageBubble`
 * (`handleRespondReminder`); pulling the decision out here is what makes it
 * reachable from a unit test on iOS, where the screen itself is not testable.
 */
export type ReminderResponseOutcome = {
  /** The `response` to record in metadata — `null` means record nothing. */
  write: "yes" | "no" | null;
  /** An error toast to show, or `null` when there is nothing to say. */
  toastKey: string | null;
};

export function reminderResponseOutcome(
  action: string | null | undefined
): ReminderResponseOutcome {
  // PAD-68: the answer was refused, so leave the message exactly as it was and
  // say why instead of inventing a state for it.
  if (action === "expired") {
    return { write: null, toastKey: "messages.reminderExpired" };
  }

  // Same asymmetry as `reminderState`: only an explicit "confirmed" reads as a
  // yes, so an unrecognised action fails safe to absent rather than showing a
  // confirmation the server never gave.
  return { write: action === "confirmed" ? "yes" : "no", toastKey: null };
}
