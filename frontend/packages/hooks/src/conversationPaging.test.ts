import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "@levelup/types";
import {
  AT_BOTTOM_THRESHOLD_PX,
  CONVERSATION_FIRST_PAGE_SIZE,
  CONVERSATION_PAGE_SIZE,
  applyIncomingMessage,
  isAtBottom,
  isNearTop,
  mergeOlderPage,
  shouldLoadOlder,
  shouldShowJumpToBottom,
} from "./conversationPaging";

/**
 * PAD-208 / B-027 — the platform-neutral half of the thread's paging and scroll
 * anchoring (messaging.conversation-detail rules 10 and 11).
 */

function message(id: string | number, content = `m${id}`): Message {
  return {
    id: String(id),
    senderId: 1,
    content,
    timestamp: "2026-09-01T10:00:00Z",
    isRead: true,
    status: "delivered",
    replyTo: null,
    edited: false,
    isDeleted: false,
    reactions: [],
  } as Message;
}

function conversation(messages: Message[], hasMore = true): Conversation {
  return {
    id: "7",
    participantId: "2",
    participantName: "Bruno",
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
    messages,
    hasMore,
    oldestMessageId: messages.length ? messages[0].id : null,
  };
}

describe("isAtBottom — rule 10's threshold", () => {
  it("is true when the viewport sits at the end of the content", () => {
    expect(
      isAtBottom({ scrollOffset: 900, viewportLength: 600, contentLength: 1500 })
    ).toBe(true);
  });

  it("is true within one bubble of the end, so an arrival still pins", () => {
    expect(
      isAtBottom({ scrollOffset: 880, viewportLength: 600, contentLength: 1500 })
    ).toBe(true);
  });

  it("is false once the reader has deliberately scrolled up", () => {
    expect(
      isAtBottom({ scrollOffset: 200, viewportLength: 600, contentLength: 1500 })
    ).toBe(false);
  });

  it("is true for a thread shorter than the viewport", () => {
    expect(
      isAtBottom({ scrollOffset: 0, viewportLength: 600, contentLength: 200 })
    ).toBe(true);
  });
});

describe("shouldLoadOlder — rule 11's guard", () => {
  it("loads when near the top and the server says there is more", () => {
    expect(
      shouldLoadOlder({ nearTop: true, hasMore: true, isLoadingOlder: false })
    ).toBe(true);
  });

  it("does not load a second page while one is in flight", () => {
    expect(
      shouldLoadOlder({ nearTop: true, hasMore: true, isLoadingOlder: true })
    ).toBe(false);
  });

  it("does not load once the whole history is loaded", () => {
    expect(
      shouldLoadOlder({ nearTop: true, hasMore: false, isLoadingOlder: false })
    ).toBe(false);
  });

  it("does not load before the reader reaches the top", () => {
    expect(
      shouldLoadOlder({ nearTop: false, hasMore: true, isLoadingOlder: false })
    ).toBe(false);
  });

  it("does not load when the payload predates paging (hasMore undefined)", () => {
    expect(
      shouldLoadOlder({
        nearTop: true,
        hasMore: undefined,
        isLoadingOlder: false,
      })
    ).toBe(false);
  });

  it("treats the top threshold the same way the bottom one is measured", () => {
    expect(isNearTop({ scrollOffset: AT_BOTTOM_THRESHOLD_PX - 1 })).toBe(true);
    expect(isNearTop({ scrollOffset: AT_BOTTOM_THRESHOLD_PX + 1 })).toBe(false);
  });
});

describe("mergeOlderPage — rule 11's prepend", () => {
  it("puts the older page in front, keeping the thread ascending", () => {
    const merged = mergeOlderPage(
      conversation([message(11), message(12)]),
      { messages: [message(9), message(10)], hasMore: true }
    );

    expect(merged.messages.map((m) => m.id)).toEqual(["9", "10", "11", "12"]);
  });

  it("carries the fetched page's hasMore and the new oldest id", () => {
    const merged = mergeOlderPage(
      conversation([message(11)]),
      { messages: [message(9), message(10)], hasMore: false }
    );

    expect(merged.hasMore).toBe(false);
    expect(merged.oldestMessageId).toBe("9");
  });

  it("de-duplicates rather than trusting the cursor", () => {
    const merged = mergeOlderPage(
      conversation([message(10), message(11)]),
      { messages: [message(9), message(10)], hasMore: true }
    );

    expect(merged.messages.map((m) => m.id)).toEqual(["9", "10", "11"]);
  });

  it("leaves the rest of the conversation summary untouched", () => {
    const merged = mergeOlderPage(conversation([message(11)]), {
      messages: [message(10)],
      hasMore: true,
    });

    expect(merged.participantName).toBe("Bruno");
    expect(merged.id).toBe("7");
  });

  it("reports no older messages once an empty page comes back", () => {
    const merged = mergeOlderPage(conversation([message(1)]), {
      messages: [],
      hasMore: false,
    });

    expect(merged.messages.map((m) => m.id)).toEqual(["1"]);
    expect(merged.hasMore).toBe(false);
  });
});

describe("applyIncomingMessage — rule 10's 'newest page only'", () => {
  it("appends an arrival at the end, leaving older pages alone", () => {
    const applied = applyIncomingMessage(
      conversation([message(9), message(10)]),
      message(11)
    );

    expect(applied.messages.map((m) => m.id)).toEqual(["9", "10", "11"]);
  });

  it("promotes an echo of the sender's own message instead of duplicating it", () => {
    const own = { ...message(11), status: "sent" as const };
    const applied = applyIncomingMessage(conversation([message(10), own]), {
      ...message(11),
      status: "sent",
    } as Message);

    expect(applied.messages).toHaveLength(2);
    expect(applied.messages[1].status).toBe("delivered");
  });

  it("matches ids across the string/number boundary the backend mixes", () => {
    const applied = applyIncomingMessage(conversation([message("11")]), {
      ...message(11),
      id: 11 as unknown as string,
    });

    expect(applied.messages).toHaveLength(1);
  });
});

/**
 * PAD-224 / B-028 — messaging.conversation-detail rules 9 and 12.
 */

describe("the first page is small so the anchor is immediate (rule 9)", () => {
  it("opens with 30 messages, not a full page", () => {
    expect(CONVERSATION_FIRST_PAGE_SIZE).toBe(30);
  });

  it("still walks back in larger pages once the reader is deliberately reading older", () => {
    expect(CONVERSATION_PAGE_SIZE).toBeGreaterThan(CONVERSATION_FIRST_PAGE_SIZE);
  });
});

describe("shouldShowJumpToBottom — rule 12", () => {
  const viewportHeight = 600;

  it("is shown once the reader is more than a screen above the bottom", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 1800,
        viewportHeight,
        hasUnseen: false,
      })
    ).toBe(true);
  });

  it("is NOT conditional on a new message — a plain scroll back is enough", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 601,
        viewportHeight,
        hasUnseen: false,
      })
    ).toBe(true);
  });

  it("is hidden within a screen of the bottom when nothing has arrived", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 400,
        viewportHeight,
        hasUnseen: false,
      })
    ).toBe(false);
  });

  it("is hidden at the bottom", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 0,
        viewportHeight,
        hasUnseen: false,
      })
    ).toBe(false);
  });

  it("is shown for unseen messages even just above the bottom — rule 10 folds into it", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 250,
        viewportHeight,
        hasUnseen: true,
      })
    ).toBe(true);
  });

  it("is still hidden at the bottom even with the unseen flag set stale", () => {
    expect(
      shouldShowJumpToBottom({
        distanceFromBottom: 0,
        viewportHeight,
        hasUnseen: true,
      })
    ).toBe(false);
  });

  it("scales with the viewport rather than using a fixed pixel budget", () => {
    const metrics = { distanceFromBottom: 700, hasUnseen: false };
    expect(shouldShowJumpToBottom({ ...metrics, viewportHeight: 400 })).toBe(true);
    expect(shouldShowJumpToBottom({ ...metrics, viewportHeight: 1000 })).toBe(false);
  });
});
