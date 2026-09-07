/**
 * What a `waiting_list_offer` message offers the student (PAD-124).
 *
 * The offer is the whole self-service join path for the waiting list: it is
 * sent on the "sorry, that spot was just filled" branch and answering Yes is
 * the only way a student can create a `WaitingListEntry` of their own. The
 * backend endpoint (`POST /api/app/notify/respond_waiting_list`) has existed
 * since the engine was built, but neither client ever rendered a Yes/No on the
 * message, so the path was unreachable — PAD-124 is that dead path.
 *
 * Same shape and the same reasons as `reminder-state.ts`: web derives this
 * inline inside its `MessageBubble`, and pulling it out here is what makes it
 * reachable from a unit test on iOS, where the screen itself is not testable.
 */

export type WaitingListOfferMetadata = {
  responded?: boolean;
  /** `"yes"`, `"no"` or `"expired"` — what the server actually recorded. */
  response?: string;
};

/** An answer given in this session, before it lands back in metadata. */
export type WaitingListLocalResponse =
  | "accepted"
  | "declined"
  | "expired"
  | null;

export type WaitingListOfferState = {
  /** Answered yes — the student is queued for that class. */
  joined: boolean;
  /** Answered no — the offer is closed and nothing was queued. */
  declined: boolean;
  /** The class already started, so the offer can no longer be taken up. */
  expired: boolean;
  /** Nothing answered yet and still answerable: show Yes/No. */
  showResponseButtons: boolean;
};

/**
 * Derive the offer's state.
 *
 * @param metadata  the message's metadata
 * @param localResponse  an answer given in this session, for shells that keep
 *                       the answer in component state rather than writing it
 *                       back into the cached message (web does the former)
 */
export function waitingListOfferState(
  metadata: WaitingListOfferMetadata | null | undefined,
  localResponse: WaitingListLocalResponse = null
): WaitingListOfferState {
  const alreadyResponded = !!metadata?.responded;
  const recorded = alreadyResponded ? metadata?.response : undefined;

  // PAD-68: a class that has already started can no longer take a waiting-list
  // entry, so the server refuses the answer and records "expired" instead.
  const expired =
    localResponse === "expired" ||
    (localResponse === null && recorded === "expired");

  const joined =
    localResponse === "accepted" ||
    (localResponse === null && recorded === "yes");

  // Note the asymmetry, which matches the reminder bubble: any recorded answer
  // that is neither "yes" nor "expired" reads as declined, so an unrecognised
  // value fails safe to "not queued" rather than promising a place on a list
  // the student was never added to.
  const declined =
    !expired &&
    !joined &&
    (localResponse === "declined" ||
      (localResponse === null && alreadyResponded));

  return {
    joined,
    declined,
    expired,
    showResponseButtons: !joined && !declined && !expired,
  };
}

/**
 * What to do with the action the server returned for an offer answer.
 *
 * The tap is a request, not the outcome — exactly as for the reminder. The
 * endpoint returns `added_to_waiting_list` / `declined` / `expired` /
 * `unknown`, and only the first three describe something that was recorded.
 */
export type WaitingListResponseOutcome = {
  /** The `response` to record in metadata — `null` means record nothing. */
  write: "yes" | "no" | "expired" | null;
  /** An error toast to show, or `null` when there is nothing to say. */
  toastKey: string | null;
};

export function waitingListResponseOutcome(
  action: string | null | undefined
): WaitingListResponseOutcome {
  if (action === "added_to_waiting_list") {
    return { write: "yes", toastKey: null };
  }
  if (action === "declined") {
    return { write: "no", toastKey: null };
  }
  // PAD-68: refused because the class has already started. The offer is dead
  // rather than unanswered, so it settles into an expired badge — but the
  // student is told, because they did tap Yes and are not on any list.
  if (action === "expired") {
    return { write: "expired", toastKey: "messages.waitingListOfferExpired" };
  }
  // "unknown" (no coach on the instance) or anything unrecognised: nothing was
  // recorded, so record nothing and leave the question answerable.
  return { write: null, toastKey: "messages.somethingWentWrong" };
}
