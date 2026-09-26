/**
 * PAD-415 (messaging.conversation-detail rule 9a) — the order of an open on iOS.
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made before the thread
 * is marked read. The thread query keeps data for 30 s (staleTime), so a re-open first
 * renders a cached copy that carries the previous visit's value. The id is frozen only
 * from a fetch made during this open (`isFetchedAfterMount`); the mark-read waits while
 * such a fetch is in flight, and goes at once when a still-fresh cache means none is
 * coming. A refetch on mount is forced only for a plain open (`threadQueryOverrides`, B-190):
 * forcing it on a push-target open broke that landing (flow 103). Pure, so the ordering is
 * testable without mounting react-query.
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

/**
 * B-190 (PAD-415): the thread query's per-open overrides. The thread's cache entry is the one the
 * SSE handlers write into, and every write makes it fresh again for the app's 30 s `staleTime` —
 * so a coach who opens a thread soon after new messages arrived opens a FRESH entry: no GET, no
 * `isFetchedAfterMount`, no frozen first unread, no divider and no landing. A plain open therefore
 * always makes its own GET. A push-tap open (an explicit `?message=` target) keeps the cache, as
 * PAD-408's landing (flow 103) needs — and it does not use the first unread anyway.
 */
export function threadQueryOverrides(explicitTarget: string | null): { refetchOnMount: "always" } | undefined {
  return explicitTarget ? undefined : { refetchOnMount: "always" };
}
