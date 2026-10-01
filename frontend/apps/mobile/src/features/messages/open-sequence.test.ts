/**
 * PAD-415 — the iOS thread's open ordering (messaging.conversation-detail rule 9a).
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made BEFORE the thread
 * is marked read. The thread query keeps data for 30 s, so a re-open first renders a
 * CACHED copy carrying the previous visit's value. Two guards follow, pinned here:
 * the id is frozen only once this open's own fetch has settled, and while that fetch is
 * in flight the mark-read waits for it (marking first would race the GET and let it
 * come back with nothing unread). A still-fresh cache means no GET is coming, so the
 * thread is marked read at once and opens at the newest message with no divider.
 * B-222: "settled" is the in-flight → idle edge of `isFetching`, never `isFetchedAfterMount`.
 */
import { describe, expect, it } from "vitest";
import { advanceOpenFetch, shouldFreezeFirstUnread, shouldMarkRead } from "./open-sequence";

// A cached copy on screen while this open's own GET is still in flight.
const cached = { conversationId: "7", hasConversation: true, phase: "in-flight" as const };
// A cached copy still fresh (staleTime), so no GET is coming at all.
const cachedFresh = { conversationId: "7", hasConversation: true, phase: "none" as const };
const fresh = { conversationId: "7", hasConversation: true, phase: "settled" as const };
const loading = { conversationId: "7", hasConversation: false, phase: "in-flight" as const };

describe("advanceOpenFetch", () => {
  it("the first observation decides: fetching means a GET is coming, idle means none is", () => {
    expect(advanceOpenFetch(null, "7", true, false).phase).toBe("in-flight");
    expect(advanceOpenFetch(null, "7", false, false).phase).toBe("none");
  });
  it("settles only on the in-flight → idle edge, and stays settled", () => {
    const inFlight = advanceOpenFetch(null, "7", true, false);
    expect(advanceOpenFetch(inFlight, "7", true, false).phase).toBe("in-flight");
    const settled = advanceOpenFetch(inFlight, "7", false, false);
    expect(settled.phase).toBe("settled");
    expect(advanceOpenFetch(settled, "7", true, false).phase).toBe("settled");
  });
  it("a fresh cache never settles: a later fetch is not this open's answer", () => {
    const none = advanceOpenFetch(null, "7", false, false);
    expect(advanceOpenFetch(advanceOpenFetch(none, "7", true, false), "7", false, false).phase).toBe("none");
  });
  it("starts over for another conversation", () => {
    const settled = advanceOpenFetch(advanceOpenFetch(null, "7", true, false), "7", false, false);
    expect(advanceOpenFetch(settled, "8", true, false)).toEqual({ conversationId: "8", phase: "in-flight" });
  });
});

describe("shouldMarkRead", () => {
  it("waits while a cached copy is on screen and this open's GET is in flight", () => {
    expect(shouldMarkRead(cached, null)).toBe(false);
  });
  it("marks a still-fresh cached copy at once: no GET is coming", () => {
    expect(shouldMarkRead(cachedFresh, null)).toBe(true);
  });
  it("marks once this open's own GET has settled", () => {
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
  it("freezes from this open's own settled GET, once per conversation", () => {
    expect(shouldFreezeFirstUnread(fresh, null)).toBe(true);
    expect(shouldFreezeFirstUnread(fresh, "7")).toBe(false);
  });
});
