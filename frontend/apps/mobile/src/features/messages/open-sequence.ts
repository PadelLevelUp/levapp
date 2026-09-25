/**
 * PAD-415 (messaging.conversation-detail rule 9a) — the order of an open on iOS.
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made before the thread
 * is marked read. The thread query keeps data for 30 s (staleTime), so a re-open first
 * renders a cached copy that carries the previous visit's value; the screen refetches on
 * mount, and both decisions below wait for that fresh response (`isFetchedAfterMount`).
 * Pure, so the ordering is testable without mounting react-query.
 */
export type OpenState = {
  conversationId: string;
  hasConversation: boolean;
  isFetchedAfterMount: boolean;
};

/** Mark the thread read once per open, and only after this open's own GET landed. */
export function shouldMarkRead(state: OpenState, markedFor: string | null): boolean {
  return state.hasConversation && state.isFetchedAfterMount && markedFor !== state.conversationId;
}

/** Freeze `firstUnreadMessageId` once per open, only from this open's own GET. */
export function shouldFreezeFirstUnread(state: OpenState, frozenFor: string | null): boolean {
  return state.hasConversation && state.isFetchedAfterMount && frozenFor !== state.conversationId;
}
