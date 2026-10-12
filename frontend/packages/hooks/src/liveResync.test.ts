/**
 * PAD-616 (messaging.sse-realtime rule 18): after the stream re-opens, both shells answer the
 * hub's `resync` with `resyncLiveData`, which invalidates every query the realtime handlers keep
 * live. React Query refetches only what is on screen; the rest is marked stale for its next mount —
 * so a resync never fans out into a refetch storm.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "./queryKeys";
import { resyncLiveData } from "./requestEvents";

const LIVE_KEYS = [
  queryKeys.unreadCount,
  queryKeys.conversations(1),
  queryKeys.classRequests,
  queryKeys.classJoinRequests,
  queryKeys.classWaitingList,
  queryKeys.pendingValidationBadge,
  queryKeys.dashboard({ from: "2026-10-12", to: "2026-10-18" }),
  ["calendar-events", "2026-10-12", "2026-10-18"],
  ["class-instance", 42],
  ["academy-classes"],
] as const;

describe("resyncLiveData (PAD-616)", () => {
  it("invalidates every live key", async () => {
    const qc = new QueryClient();
    for (const key of LIVE_KEYS) qc.setQueryData(key as readonly unknown[], { seeded: true });
    await resyncLiveData(qc);
    for (const key of LIVE_KEYS) {
      expect(qc.getQueryState(key as readonly unknown[])?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });

  it("refetches what is on screen once, and only marks the rest stale", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
    const unread = vi.fn().mockResolvedValue({ unreadCount: 3 });
    const conversations = vi.fn().mockResolvedValue({ conversations: [] });
    const observer = new QueryObserver(qc, { queryKey: queryKeys.unreadCount, queryFn: unread });
    const unsubscribe = observer.subscribe(() => undefined); // on screen
    await vi.waitFor(() => expect(qc.getQueryState(queryKeys.unreadCount)?.status).toBe("success"));
    expect(unread).toHaveBeenCalledTimes(1);
    qc.setQueryData(queryKeys.conversations(1), { conversations: [] }); // not on screen
    await resyncLiveData(qc);
    expect(unread).toHaveBeenCalledTimes(2);
    expect(conversations).not.toHaveBeenCalled();
    expect(qc.getQueryState(queryKeys.conversations(1))?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it("leaves a key nobody keeps live alone", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["player-profile", "7"], { name: "Ana" });
    await resyncLiveData(qc);
    expect(qc.getQueryState(["player-profile", "7"])?.isInvalidated).toBe(false);
  });
});
