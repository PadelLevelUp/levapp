/**
 * B-222 (PAD-415, messaging.conversation-detail rule 9a): a live write during this open's GET.
 *
 * `isFetchedAfterMount` is `dataUpdateCount > initial` (query-core queryObserver.ts), and a
 * manual `setQueryData` bumps `dataUpdateCount` too without ending the fetch. The screen's own
 * SSE handler writes the thread entry (`updateConversationCache`), so a message_created that
 * landed while the open's GET was in flight made the cached copy look like this open's answer:
 * the first unread froze to the previous visit's value and the mark-read raced the GET. The
 * same count made `loadOlder`'s page merge freeze a stale divider on a push-target open.
 * Driven on query-core the way the screen observes the entry; the hooks cannot be mounted
 * here (two React copies, PAD-400).
 */
import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import {
  advanceOpenFetch,
  shouldFreezeFirstUnread,
  shouldMarkRead,
  threadQueryOverrides,
  type OpenFetch,
} from "./open-sequence";

type Thread = { id: string; messages: unknown[]; firstUnreadMessageId: number | null };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const KEY = ["conversation", "1"];

/** Opens the thread over a cached previous visit (first unread 111) and returns the screen's view. */
function openOverCache(explicitTarget: string | null, staleCache = false) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  // The cached page holds a message NEWER than the push target used below (555): the target is
  // in an older page, flow 103's shape, so a push-target open keeps the cache (rule 12a).
  client.setQueryData<Thread>(KEY, { id: "1", messages: [{ id: 600 }], firstUnreadMessageId: 111 }, {
    updatedAt: staleCache ? Date.now() - 60_000 : Date.now(),
  });
  let answer: (t: Thread) => void = () => {};
  let fetches = 0;
  const observer = new QueryObserver<Thread>(client, {
    queryKey: KEY,
    queryFn: () => {
      fetches += 1;
      return new Promise<Thread>((resolve) => (answer = resolve));
    },
    ...threadQueryOverrides(explicitTarget, [600]),
  });
  // useBaseQuery's first render: defaulted options with `_optimisticResults: "optimistic"`.
  const firstRender = client.defaultQueryOptions(observer.options);
  firstRender._optimisticResults = "optimistic";
  // The screen advances its phase on every render: the first one (useBaseQuery passes
  // `_optimisticResults: "optimistic"`, so it reports the mount fetch as already running), then each notify.
  let phase: OpenFetch = advanceOpenFetch(null, "1", observer.getOptimisticResult(firstRender).isFetching);
  const unsubscribe = observer.subscribe((r) => (phase = advanceOpenFetch(phase, "1", r.isFetching)));
  const view = () => {
    const r = observer.getCurrentResult();
    const state = { conversationId: "1", hasConversation: !!r.data, phase: phase.phase };
    return {
      isFetching: r.isFetching,
      phase: phase.phase,
      freezes: shouldFreezeFirstUnread(state, null),
      marksRead: shouldMarkRead(state, null),
      firstUnread: r.data?.firstUnreadMessageId ?? null,
    };
  };
  const liveWrite = () =>
    client.setQueryData<Thread>(KEY, (prev) => (prev ? { ...prev, messages: [...prev.messages, { id: 300 }] } : prev));
  return { view, liveWrite, answer: (t: Thread) => answer(t), fetches: () => fetches, unsubscribe };
}

describe("a live write while this open's GET is in flight (B-222)", () => {
  it("neither freezes the cached first unread nor marks read before the GET answers", async () => {
    const open = openOverCache(null);
    await flush();
    open.liveWrite(); // message_created arrives mid-flight; the SSE handler writes the entry
    await flush();

    const mid = open.view();
    expect(mid.isFetching).toBe(true);
    expect(mid.freezes).toBe(false);
    expect(mid.marksRead).toBe(false);

    open.answer({ id: "1", messages: [{ id: 244 }, { id: 300 }], firstUnreadMessageId: 244 });
    await flush();
    const settled = open.view();
    expect(settled.phase).toBe("settled");
    expect(settled.freezes).toBe(true);
    expect(settled.firstUnread).toBe(244);
    expect(settled.marksRead).toBe(true);
    open.unsubscribe();
  });

  it("control: without the live write the open waits for its GET the same way", async () => {
    const open = openOverCache(null);
    await flush();
    const mid = open.view();
    expect([mid.isFetching, mid.freezes, mid.marksRead]).toEqual([true, false, false]);
    open.answer({ id: "1", messages: [{ id: 244 }], firstUnreadMessageId: 244 });
    await flush();
    expect(open.view()).toMatchObject({ phase: "settled", freezes: true, firstUnread: 244 });
    open.unsubscribe();
  });
});

describe("a push-target open on an OLDER message over a fresh cache (B-222, loadOlder's page merge)", () => {
  it("makes no GET, marks read at once, and a later page merge never freezes the cached first unread", async () => {
    const open = openOverCache("555");
    await flush();
    expect(open.fetches()).toBe(0);
    expect(open.view()).toMatchObject({ phase: "none", freezes: false, marksRead: true });

    open.liveWrite(); // loadOlder prepends a page into the same entry
    await flush();
    expect(open.view()).toMatchObject({ phase: "none", freezes: false });
    open.unsubscribe();
  });

  it("over a stale cache it makes its GET and freezes from that answer, like web", async () => {
    const open = openOverCache("555", true);
    await flush();
    expect(open.fetches()).toBe(1);
    expect(open.view()).toMatchObject({ phase: "in-flight", freezes: false });
    open.answer({ id: "1", messages: [{ id: 244 }], firstUnreadMessageId: 244 });
    await flush();
    expect(open.view()).toMatchObject({ phase: "settled", freezes: true, firstUnread: 244 });
    open.unsubscribe();
  });
});
