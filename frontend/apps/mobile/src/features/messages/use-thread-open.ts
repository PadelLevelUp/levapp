/**
 * PAD-475 — the thread screen's open, in one place the tests can mount (#488 review: the pure
 * functions were tested, the screen's use of them was not). The screen takes four decisions
 * from here and holds none of their inputs itself:
 *  - the override its thread query is given (messaging.push-notifications rule 12a, B-236),
 *    decided once per open from the cache as this open found it;
 *  - this open's fetch phase, from the thread query's own `isFetching` and `isError` (B-222);
 *  - the target step, which waits while the open's GET is in flight (rule 12b, B-237);
 *  - where a failed landing scroll is retried, by message id in the list as it is now
 *    (messaging.conversation-detail rule 9b, B-238).
 * The query client is an argument, not `useQueryClient()`, so the hook mounts under the test
 * harness with `@levelup/hooks` scripted (use-thread-open.test.tsx).
 */
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { nextTargetStep, queryKeys, useConversationThread, type MessageTargetStep } from "@levelup/hooks";
import type { Conversation, Message } from "@levelup/types";
import { advanceOpenFetch, threadQueryOverrides, type OpenFetch } from "./open-sequence";
import { retryScrollIndex, shouldStepTarget } from "./target-landing";

export type TargetStep = MessageTargetStep | { kind: "wait" };

export function useThreadOpen(args: {
  conversationId: string;
  target: string | null;
  queryClient: Pick<QueryClient, "getQueryData">;
}) {
  const { conversationId, target, queryClient } = args;

  // Decided ONCE per open (conversation + target): the GET it may force puts the target into
  // the cache, which must not flip the answer mid-open.
  const openKey = `${conversationId}|${target ?? ""}`;
  const overridesRef = React.useRef<{ key: string; value: ReturnType<typeof threadQueryOverrides> } | null>(null);
  if (overridesRef.current?.key !== openKey) {
    const cached = queryClient.getQueryData<Conversation>(queryKeys.conversation(conversationId));
    overridesRef.current = {
      key: openKey,
      value: threadQueryOverrides(target, cached ? cached.messages.map((m) => m.id) : null),
    };
  }
  const thread = useConversationThread(conversationId, overridesRef.current.value);

  // Advanced during render from `isFetching` alone: a live `setQueryData` (the SSE handlers,
  // `loadOlder`) bumps query-core's data count mid-flight, so `isFetchedAfterMount` cannot
  // tell this open's answer from a cached copy.
  const openFetchRef = React.useRef<OpenFetch | null>(null);
  openFetchRef.current = advanceOpenFetch(openFetchRef.current, conversationId, thread.isFetching, thread.isError);
  const openPhase = openFetchRef.current.phase;

  // The list as it is NOW, and the message the last scroll was for. `scrollStarted` is called
  // by the screen's one scroll primitive, so the id is never another scroll's.
  const messagesRef = React.useRef<Message[]>([]);
  messagesRef.current = thread.data?.messages ?? [];
  const scrollTargetIdRef = React.useRef<string | number | null>(null);
  const hasOlder = thread.hasMore;

  const targetStep = React.useCallback(
    (targetId: string, olderPagesLoaded: number): TargetStep => {
      if (!shouldStepTarget(openPhase)) return { kind: "wait" };
      return nextTargetStep({ messages: messagesRef.current, targetId, olderPagesLoaded, hasOlder });
    },
    [openPhase, hasOlder]
  );
  const scrollStarted = React.useCallback((messageId: string | number) => {
    scrollTargetIdRef.current = messageId;
  }, []);
  const retryIndex = React.useCallback(
    (): number | null => retryScrollIndex(messagesRef.current, scrollTargetIdRef.current),
    []
  );

  return { thread, openPhase, targetStep, scrollStarted, retryIndex };
}
