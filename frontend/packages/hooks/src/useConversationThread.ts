import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as messagesApi from "@levelup/api/src/resources/messages";
import type { Conversation } from "@levelup/types";
import { queryKeys } from "./queryKeys";
import {
  CONVERSATION_FIRST_PAGE_SIZE,
  CONVERSATION_PAGE_SIZE,
  mergeOlderPage,
} from "./conversationPaging";
import type { QueryOverrides } from "./queries";

/**
 * A conversation thread, paged (messaging.conversation-detail rules 1 and 11).
 *
 * The first page is the newest `CONVERSATION_PAGE_SIZE` messages;
 * `loadOlder()` fetches the page before the oldest loaded one and prepends it.
 * The result is written back into the *same* cache entry
 * (`queryKeys.conversation(id)`) that `useConversation` populated and that the
 * SSE handlers update, so the thread stays one ascending array and nothing else
 * in the messaging code has to learn about pages.
 *
 * This is deliberately not `useInfiniteQuery`: an infinite query would reshape
 * that cache entry into `{ pages, pageParams }`, and every SSE writer — message
 * created, edited, deleted, reacted, on both shells — reads and writes the flat
 * `Conversation`. The paging that matters here is one direction, one page at a
 * time, into a list that also grows from the other end; a flat entry expresses
 * that more honestly than a page array in which "the newest page" is an index.
 */
export function useConversationThread(
  conversationId: string | null | undefined,
  options?: QueryOverrides<Conversation>
) {
  const queryClient = useQueryClient();
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // A flick to the top fires many scroll events; only one page may be in
  // flight. State alone is too slow — it is not readable until the next render.
  const inFlightRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.conversation(conversationId ?? "none"),
    queryFn: () =>
      messagesApi.getConversation(conversationId as string, {
        // PAD-224 rule 9 — the OPEN is deliberately smaller than a walk-back
        // page: on the native shell the first page's row count is how long the
        // thread stays unanchored, and therefore hidden.
        limit: CONVERSATION_FIRST_PAGE_SIZE,
      }),
    enabled: !!conversationId,
    ...options,
  });

  const conversation = query.data;
  const hasMore = conversation?.hasMore === true;

  const loadOlder = useCallback(async () => {
    if (!conversationId || inFlightRef.current) return;

    const current = queryClient.getQueryData<Conversation>(
      queryKeys.conversation(conversationId)
    );
    if (!current || current.hasMore !== true) return;

    const before = current.oldestMessageId ?? current.messages[0]?.id;
    if (before == null) return;

    inFlightRef.current = true;
    setIsLoadingOlder(true);
    try {
      const older = await messagesApi.getConversation(conversationId, {
        limit: CONVERSATION_PAGE_SIZE,
        before,
      });
      queryClient.setQueryData<Conversation>(
        queryKeys.conversation(conversationId),
        // Re-read rather than closing over `current`: an SSE arrival may have
        // appended to the newest page while this request was in flight.
        (latest) => (latest ? mergeOlderPage(latest, older) : latest)
      );
    } catch {
      // Leave `hasMore` as it was — the next scroll to the top retries. A
      // failed page must not be mistaken for the end of the history.
    } finally {
      inFlightRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [conversationId, queryClient]);

  return { ...query, hasMore, isLoadingOlder, loadOlder };
}
