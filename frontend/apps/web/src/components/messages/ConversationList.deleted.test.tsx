/**
 * messaging.conversations rule 12a (PAD-639, B-547): a row whose last message was deleted shows
 * "Message deleted" in its preview; a live last message shows its text.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Conversation } from "@/types";
import { ConversationList } from "./ConversationList";

// PAD-683: the list mounts NewConversationDialog, whose coach-only name resolver reads the roster
// through react-query; these tests are about the list, so the resolver returns the payload's name.
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCoachDisplayName: () => (_id: unknown, fallback: string | null | undefined) => fallback ?? "",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "5", participantId: "2", participantName: "Ana Lopes", lastMessage: "See you Monday",
    lastMessageAt: "2026-09-25T10:00:00Z", unreadCount: 0, messages: [], ...overrides,
  };
}

const noop = () => {};

function renderList(c: Conversation) {
  render(<ConversationList conversations={[c]} selectedId={null} onSelect={noop} onNewConversation={noop} />);
}

describe("ConversationList — a deleted last message (PAD-639)", () => {
  it("shows the live last message's text", () => {
    renderList(conversation({ lastMessageDeleted: false }));
    expect(screen.getByText("See you Monday")).toBeInTheDocument();
    expect(screen.queryByText("messages.messageDeleted")).toBeNull();
  });

  it("shows 'Message deleted' when the last message was deleted", () => {
    renderList(conversation({ lastMessage: "", lastMessageDeleted: true }));
    expect(screen.getByText("messages.messageDeleted")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-last-message").getAttribute("data-deleted")).toBe("true");
  });
});
