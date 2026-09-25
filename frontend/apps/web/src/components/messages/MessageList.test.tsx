/**
 * PAD-415 — messaging.conversation-detail rule 9a: a thread opens at its
 * first unread message under a divider; an explicit `?message=` target (a
 * push tap, a deep link) still wins and keeps its highlight, but landing on
 * the first unread does not flash a highlight.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Message } from "@/types";
import { MessageList } from "./MessageList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message }: { message: Message }) => (
    <div>{message.content}</div>
  ),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function message(id: string | number, overrides: Partial<Message> = {}): Message {
  return {
    id: String(id),
    senderId: 2,
    content: `m${id}`,
    timestamp: "2026-09-25T10:00:00Z",
    isRead: true,
    status: "delivered",
    replyTo: null,
    edited: false,
    isDeleted: false,
    reactions: [],
    ...overrides,
  };
}

const noop = () => {};

describe("MessageList — the first-unread divider", () => {
  it("renders 'Unread messages' directly above the frozen first-unread message", () => {
    const messages = [message(44), message(45), message(46), message(47)];
    const { container } = render(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        firstUnreadMessageId={46}
      />
    );

    const divider = screen.getByTestId("unread-divider");
    const target = container.querySelector('[data-msg-id="46"]');
    expect(target).not.toBeNull();
    // Adjacent siblings: nothing else sits between the divider and its message.
    expect(divider.nextElementSibling).toBe(target);
  });

  it("shows no divider when nothing is unread", () => {
    const messages = [message(44), message(45)];
    render(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        firstUnreadMessageId={null}
      />
    );
    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });

  it("is gone once a re-open reports nothing unread, even with the same messages loaded", () => {
    const messages = [message(44), message(46)];
    const { rerender } = render(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        firstUnreadMessageId={46}
      />
    );
    expect(screen.getByTestId("unread-divider")).toBeInTheDocument();

    rerender(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        firstUnreadMessageId={null}
      />
    );
    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });
});

describe("MessageList — opening target (rule 9a)", () => {
  it("scrolls to and highlights an explicit target over the first unread", async () => {
    const messages = [message(44), message(46), message(58)];
    const { container } = render(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        targetMessageId="58"
        firstUnreadMessageId={46}
      />
    );

    await waitFor(() => {
      const row = container.querySelector('[data-msg-id="58"]');
      expect(row?.getAttribute("data-highlighted")).toBe("true");
    });
  });

  it("anchors at the first unread with no explicit target, and does not highlight it", async () => {
    const messages = [message(44), message(46), message(58)];
    const { container } = render(
      <MessageList
        messages={messages}
        userId={1}
        participantName="Ana"
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onReaction={noop}
        targetMessageId={null}
        firstUnreadMessageId={46}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("unread-divider")).toBeInTheDocument();
    });
    expect(container.querySelector('[data-highlighted="true"]')).toBeNull();
  });
});
