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
export type OpenFetchPhase = "in-flight" | "settled" | "failed" | "none";
export type OpenFetch = { conversationId: string; phase: OpenFetchPhase };

/**
 * Advance this open's fetch phase from the query's `isFetching` and `isError`. The first
 * observation of a conversation decides whether a fetch is coming (`in-flight`) or not (`none`,
 * a still-fresh cache). An `in-flight` fetch ends `settled`, or `failed` when it ended in an
 * error (PAD-475, rule 12a: a GET that did not answer has shown the reader nothing new, so it
 * must not release the read mark). A `failed` open goes back `in-flight` when a later fetch
 * starts (Retry, a focus refetch); nothing moves a `settled` open back.
 */
export function advanceOpenFetch(
  prev: OpenFetch | null,
  conversationId: string,
  isFetching: boolean,
  isError = false
): OpenFetch {
  if (!prev || prev.conversationId !== conversationId) {
    return { conversationId, phase: isFetching ? "in-flight" : "none" };
  }
  if (prev.phase === "in-flight" && !isFetching) {
    return { conversationId, phase: isError ? "failed" : "settled" };
  }
  if (prev.phase === "failed" && isFetching) return { conversationId, phase: "in-flight" };
  return prev;
}

export type OpenState = {
  conversationId: string;
  hasConversation: boolean;
  phase: OpenFetchPhase;
};

/**
 * Mark the thread read once per open, never while this open's GET is still in flight, and
 * never after it failed: "read" is sent only for what the screen has been given to render.
 */
export function shouldMarkRead(state: OpenState, markedFor: string | null): boolean {
  return (
    state.hasConversation &&
    state.phase !== "in-flight" &&
    state.phase !== "failed" &&
    markedFor !== state.conversationId
  );
}

/** Freeze `firstUnreadMessageId` once per open, only once this open's own GET has settled. */
export function shouldFreezeFirstUnread(state: OpenState, frozenFor: string | null): boolean {
  return state.hasConversation && state.phase === "settled" && frozenFor !== state.conversationId;
}

/**
 * PAD-475 (messaging.push-notifications rule 12a, B-236): may a push-target open keep the
 * cached thread? Only on proof: the target is IN the cached thread, or it is OLDER than the
 * newest cached message (rule 12's walk through older pages, flow 103). Ids decide "older":
 * `messages.id` comes from one database sequence, so a later message has the larger id.
 * Everything else must fetch, including ids that cannot be compared (a `temp-` id, an empty
 * thread, a non-numeric target): the event stream is suspended in the background and an
 * unmounted thread receives nothing, so a push normally names a message the cache has not got.
 */
export function cacheCoversTarget(explicitTarget: string, cachedMessageIds: readonly (string | number)[]): boolean {
  if (cachedMessageIds.some((id) => String(id) === explicitTarget)) return true;
  if (!/^\d+$/.test(explicitTarget)) return false;
  const target = Number(explicitTarget);
  return cachedMessageIds.some((id) => /^\d+$/.test(String(id)) && Number(id) > target);
}

/**
 * B-190 (PAD-415): the thread query's per-open overrides. The thread's cache entry is the one the
 * SSE handlers write into, and every write makes it fresh again for the app's 30 s `staleTime` —
 * so a coach who opens a thread soon after new messages arrived opens a FRESH entry: no GET, no
 * nothing to settle, no frozen first unread, no divider and no landing. A plain open therefore
 * always makes its own GET. A push-tap open (an explicit `?message=` target) keeps the cache, as
 * PAD-408's landing (flow 103) needs, only when the cached thread covers the target
 * (`cacheCoversTarget`, B-236); otherwise it makes its own GET too. `cachedMessageIds` is the
 * cached thread's ids at the moment of the open, `null` when the thread is not cached at all
 * (the mount fetches by itself then).
 */
export function threadQueryOverrides(
  explicitTarget: string | null,
  cachedMessageIds: readonly (string | number)[] | null
): { refetchOnMount: "always" } | undefined {
  if (!explicitTarget) return { refetchOnMount: "always" };
  if (cachedMessageIds === null || cacheCoversTarget(explicitTarget, cachedMessageIds)) return undefined;
  return { refetchOnMount: "always" };
}
