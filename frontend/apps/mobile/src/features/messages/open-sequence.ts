/**
 * PAD-415 (messaging.conversation-detail rule 9a) — the order of an open on iOS.
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made before the thread
 * is marked read. The thread query keeps data for 30 s (staleTime), so a re-open first
 * renders a cached copy that carries the previous visit's value. The id is frozen only
 * from a fetch made during this open (`isFetchedAfterMount`); the mark-read waits while
 * such a fetch is in flight, and goes at once when a still-fresh cache means none is
 * coming. The screen does NOT force a refetch on mount: that broke landing on a push
 * target (flow 103). Pure, so the ordering is testable without mounting react-query.
 */
export type OpenState = {
  conversationId: string;
  hasConversation: boolean;
  isFetchedAfterMount: boolean;
  isFetching: boolean;
};

/** Mark the thread read once per open, never while this open's GET is still in flight. */
export function shouldMarkRead(state: OpenState, markedFor: string | null): boolean {
  return (
    state.hasConversation &&
    (state.isFetchedAfterMount || !state.isFetching) &&
    markedFor !== state.conversationId
  );
}

/** Freeze `firstUnreadMessageId` once per open, only from this open's own GET. */
export function shouldFreezeFirstUnread(state: OpenState, frozenFor: string | null): boolean {
  return state.hasConversation && state.isFetchedAfterMount && frozenFor !== state.conversationId;
}
