/**
 * PAD-415 (messaging.conversation-detail rule 9a) — the order of an open on iOS.
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made before the thread
 * is marked read. The thread query keeps data for 30 s (staleTime), so a re-open first
 * renders a cached copy that carries the previous visit's value. The id is frozen only
 * when this open's own fetch has settled; the mark-read waits while that fetch is in
 * flight, and goes at once when a still-fresh cache means none is coming. A refetch on
 * mount is forced only for a plain open (`threadQueryOverrides`, B-190): forcing it on a
 * push-target open broke that landing (flow 103). Pure, so the ordering is testable
 * without mounting react-query.
 *
 * B-222: "settled" is the in-flight → idle edge of the fetch this open saw, never
 * `isFetchedAfterMount`. query-core counts a manual `setQueryData` as a data update, so
 * the screen's own SSE writes (and `loadOlder`'s page merge) made a cached copy look like
 * this open's answer while the GET was still in flight.
 */
export type OpenFetchPhase = "in-flight" | "settled" | "none";
export type OpenFetch = { conversationId: string; phase: OpenFetchPhase };

/**
 * Advance this open's fetch phase from the query's `isFetching`. The first observation of a
 * conversation decides whether a fetch is coming (`in-flight`) or not (`none`, a still-fresh
 * cache); only `in-flight` can become `settled`, and nothing moves it back.
 */
export function advanceOpenFetch(prev: OpenFetch | null, conversationId: string, isFetching: boolean): OpenFetch {
  if (!prev || prev.conversationId !== conversationId) {
    return { conversationId, phase: isFetching ? "in-flight" : "none" };
  }
  if (prev.phase === "in-flight" && !isFetching) return { conversationId, phase: "settled" };
  return prev;
}

export type OpenState = {
  conversationId: string;
  hasConversation: boolean;
  phase: OpenFetchPhase;
};

/** Mark the thread read once per open, never while this open's GET is still in flight. */
export function shouldMarkRead(state: OpenState, markedFor: string | null): boolean {
  return state.hasConversation && state.phase !== "in-flight" && markedFor !== state.conversationId;
}

/** Freeze `firstUnreadMessageId` once per open, only once this open's own GET has settled. */
export function shouldFreezeFirstUnread(state: OpenState, frozenFor: string | null): boolean {
  return state.hasConversation && state.phase === "settled" && frozenFor !== state.conversationId;
}

/**
 * B-190 (PAD-415): the thread query's per-open overrides. The thread's cache entry is the one the
 * SSE handlers write into, and every write makes it fresh again for the app's 30 s `staleTime` —
 * so a coach who opens a thread soon after new messages arrived opens a FRESH entry: no GET, no
 * nothing to settle, no frozen first unread, no divider and no landing. A plain open therefore
 * always makes its own GET. A push-tap open (an explicit `?message=` target) keeps the cache, as
 * PAD-408's landing (flow 103) needs — and it does not use the first unread anyway.
 */
export function threadQueryOverrides(explicitTarget: string | null): { refetchOnMount: "always" } | undefined {
  return explicitTarget ? undefined : { refetchOnMount: "always" };
}
