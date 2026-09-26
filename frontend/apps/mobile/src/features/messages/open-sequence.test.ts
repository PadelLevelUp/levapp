/**
 * PAD-415 — the iOS thread's open ordering (messaging.conversation-detail rule 9a).
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made BEFORE the thread
 * is marked read. The thread query keeps data for 30 s, so a re-open first renders a
 * CACHED copy carrying the previous visit's value. Two guards follow, pinned here:
 * the id is frozen only from a fetch made during this open, and while such a fetch is
 * in flight the mark-read waits for it (marking first would race the GET and let it
 * come back with nothing unread). A still-fresh cache means no GET is coming, so the
 * thread is marked read at once and opens at the newest message with no divider. The
 * screen must NOT force a refetch on mount: that broke landing on a push target
 * (flow 103 red on the branch, green on staging and with the option removed).
 */
import { describe, expect, it } from "vitest";
import { shouldFreezeFirstUnread, shouldMarkRead } from "./open-sequence";

// A cached copy on screen while this open's own GET is still in flight.
const cached = { conversationId: "7", hasConversation: true, isFetchedAfterMount: false, isFetching: true };
// A cached copy still fresh (staleTime), so no GET is coming at all.
const cachedFresh = { conversationId: "7", hasConversation: true, isFetchedAfterMount: false, isFetching: false };
const fresh = { conversationId: "7", hasConversation: true, isFetchedAfterMount: true, isFetching: false };
const loading = { conversationId: "7", hasConversation: false, isFetchedAfterMount: false, isFetching: true };

describe("shouldMarkRead", () => {
  it("waits while a cached copy is on screen and this open's GET is in flight", () => {
    expect(shouldMarkRead(cached, null)).toBe(false);
  });
  it("marks a still-fresh cached copy at once: no GET is coming (PAD-415, no forced refetch)", () => {
    expect(shouldMarkRead(cachedFresh, null)).toBe(true);
  });
  it("marks once this open's own GET has landed", () => {
    expect(shouldMarkRead(fresh, null)).toBe(true);
  });
  it("marks once per conversation", () => {
    expect(shouldMarkRead(fresh, "7")).toBe(false);
    expect(shouldMarkRead({ ...fresh, conversationId: "8" }, "7")).toBe(true);
  });
  it("does nothing before any data", () => {
    expect(shouldMarkRead(loading, null)).toBe(false);
  });
});

describe("shouldFreezeFirstUnread", () => {
  it("never freezes the cached copy's value", () => {
    expect(shouldFreezeFirstUnread(cached, null)).toBe(false);
    expect(shouldFreezeFirstUnread(cachedFresh, null)).toBe(false);
  });
  it("freezes from this open's own GET, once per conversation", () => {
    expect(shouldFreezeFirstUnread(fresh, null)).toBe(true);
    expect(shouldFreezeFirstUnread(fresh, "7")).toBe(false);
  });
});
