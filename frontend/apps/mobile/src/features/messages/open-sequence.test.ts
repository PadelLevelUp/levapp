/**
 * PAD-415 — the iOS thread's open ordering (messaging.conversation-detail rule 9a).
 *
 * `firstUnreadMessageId` is only meaningful from the GET this open made BEFORE the thread
 * is marked read. The thread query keeps data for 30 s, so a re-open first renders a
 * CACHED copy carrying the previous visit's value. Two guards follow, pinned here:
 * the id is frozen only from this open's own fetch, and the mark-read waits for that
 * fetch too (marking on the cached copy would race the fresh GET and let it come back
 * with nothing unread).
 */
import { describe, expect, it } from "vitest";
import { shouldFreezeFirstUnread, shouldMarkRead } from "./open-sequence";

const cached = { conversationId: "7", hasConversation: true, isFetchedAfterMount: false };
const fresh = { conversationId: "7", hasConversation: true, isFetchedAfterMount: true };
const loading = { conversationId: "7", hasConversation: false, isFetchedAfterMount: false };

describe("shouldMarkRead", () => {
  it("waits while only a cached copy is on screen", () => {
    expect(shouldMarkRead(cached, null)).toBe(false);
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
  });
  it("freezes from this open's own GET, once per conversation", () => {
    expect(shouldFreezeFirstUnread(fresh, null)).toBe(true);
    expect(shouldFreezeFirstUnread(fresh, "7")).toBe(false);
  });
});
