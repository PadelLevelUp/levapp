/**
 * PAD-415 (messaging.conversation-detail rule 9a), the cached-entry half of #447's iOS landing.
 *
 * The thread's cache entry is the one the SSE handlers write into (`setQueryData`), and every
 * write makes it fresh again for the app's 30 s `staleTime`. So a coach who opens a thread soon
 * after new messages arrived opens a FRESH entry: without an override no GET runs on mount,
 * `isFetchedAfterMount` stays false, `shouldFreezeFirstUnread` never fires, and there is no
 * divider and no landing. This drives exactly that on query-core, the way the screen's hook
 * observes the entry. The hooks cannot be mounted here (two React copies, PAD-400).
 */
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { shouldFreezeFirstUnread, threadQueryOverrides } from "./open-sequence";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const KEY = ["conversation", "1"];

async function openThread(overrides: ReturnType<typeof threadQueryOverrides>) {
  // The app's global default (apps/mobile/app/_layout.tsx).
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  // A previous visit cached the thread, then an SSE message_created wrote into it just now.
  client.setQueryData(KEY, { id: "1", messages: [], firstUnreadMessageId: null });
  let fetches = 0;
  const observer = new QueryObserver(client, {
    queryKey: KEY,
    queryFn: async () => {
      fetches += 1;
      return { id: "1", messages: [], firstUnreadMessageId: 244 };
    },
    ...overrides,
  });
  const unsubscribe = observer.subscribe(() => {});
  await flush();
  const result = observer.getCurrentResult();
  unsubscribe();
  return { fetches, result };
}

describe("a plain open of a thread an SSE write just made fresh (PAD-415)", () => {
  it("fetches during this open, so the first unread is frozen from this open's own GET", async () => {
    const { fetches, result } = await openThread(threadQueryOverrides(null));

    expect(fetches).toBe(1);
    expect(result.isFetchedAfterMount).toBe(true);
    expect(
      shouldFreezeFirstUnread(
        { conversationId: "1", hasConversation: true, isFetchedAfterMount: result.isFetchedAfterMount, isFetching: result.isFetching },
        null,
      ),
    ).toBe(true);
    expect((result.data as { firstUnreadMessageId: number }).firstUnreadMessageId).toBe(244);
  });

  it("a push-tap open (an explicit target) keeps the cached entry, as flow 103 needs", () => {
    expect(threadQueryOverrides("555")).toBeUndefined();
  });
});
