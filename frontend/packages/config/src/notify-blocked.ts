/**
 * Splitting the notify/reminder `blocked` list by CAUSE (PAD-170 C6).
 *
 * `POST /app/notify/manual` and `/app/notify/send_reminders` both answer with
 * `{ sent, blocked }`, and a student lands in `blocked` for two unrelated
 * reasons that the coach must be told apart:
 *
 *  - `unavailable` (PAD-107) — they marked themselves unavailable for that slot.
 *  - `preference`  (PAD-112) — they turned invitations off altogether, and
 *    `reason` may carry their own words.
 *
 * Split on `cause`, NEVER on `reason` being empty: a student can block
 * notifications without giving a reason, and treating them as "unavailable"
 * tells the coach the wrong story about why the count came up short.
 *
 * Web derived this inline in two components (`ManualNotificationModal` and
 * `ClassDetailSheet`) and iOS did not derive it at all — the phone reported
 * "sent to N" with no hint that anyone was skipped. Sharing it here is what
 * stops the third copy from drifting.
 */

/** The little a blocked-student row has to expose to be classified. */
export interface BlockedLike {
  name?: string | null;
  /** Absent on a payload from an older backend — treated as `unavailable`. */
  cause?: string | null;
  /** `preference` only: the student's own free-text reason, when they gave one. */
  reason?: string | null;
}

export interface BlockedByCause<T> {
  /** PAD-107: unavailable for this slot. Includes rows with no `cause` at all. */
  unavailable: T[];
  /** PAD-112: opted out of invitations entirely. */
  optedOut: T[];
}

/**
 * Partition `blocked` into the two causes.
 *
 * A row with NO `cause` counts as `unavailable`, matching web's
 * `cause !== "preference"` test: an older backend only ever produced the
 * PAD-107 case, so that is the safe reading of a missing field.
 */
export function splitBlockedByCause<T extends BlockedLike>(
  blocked: T[] | null | undefined
): BlockedByCause<T> {
  const rows = blocked ?? [];
  return {
    unavailable: rows.filter((b) => b?.cause !== "preference"),
    optedOut: rows.filter((b) => b?.cause === "preference"),
  };
}

/**
 * The names in a blocked list, comma-joined for the `{{names}}` interpolation
 * both `calendar.unavailable.blocked` and `calendar.notify.blockedByPreference`
 * expect. Nameless rows are dropped rather than rendered as a gap.
 */
export function blockedNames(blocked: BlockedLike[] | null | undefined): string {
  return (blocked ?? [])
    .map((b) => b?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

/**
 * The reasons students gave for blocking notifications, joined for a toast's
 * secondary line. Empty string when nobody gave one — callers pass `undefined`
 * rather than an empty description.
 */
export function blockedReasons(blocked: BlockedLike[] | null | undefined): string {
  return (blocked ?? [])
    .map((b) => b?.reason)
    .filter((reason): reason is string => Boolean(reason))
    .join(" · ");
}

/**
 * Whether the "sent to N" confirmation should still be shown.
 *
 * PAD-107's ordering: do not crow "reminders sent to 0 students" when everyone
 * was skipped — the blocked toasts already told the whole story.
 */
export function shouldReportSent(
  sent: number,
  blocked: BlockedLike[] | null | undefined
): boolean {
  return sent > 0 || (blocked ?? []).length === 0;
}
