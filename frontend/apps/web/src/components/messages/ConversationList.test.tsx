/**
 * PAD-414 — messaging.conversations rule 16: an unread row is unmistakable.
 * A listed conversation with `unreadCount > 0` shows the participant's name
 * and the last-message preview in bold, plus the count pill ("9" up to nine,
 * "9+" above it); a read row is regular weight with no pill. Each row exposes
 * its state for tests: `data-unread` on `conversation-row-<id>`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Conversation } from "@/types";
import { ConversationList } from "./ConversationList";

// PAD-683: the list mounts NewConversationDialog, whose coach-only name resolver reads the roster
// through react-query; these tests are about the list, so the resolver returns the payload's name.
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCoachDisplayName: () => (_id: unknown, fallback: string | null | undefined) => fallback ?? "",
  useCoachDisplayNameByUser: () => (_id: unknown, fallback: string | null | undefined) => fallback ?? "",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  // `@/i18n.ts` (pulled in transitively via `@/lib/conversationTime` →
  // `@/lib/dateLocale`) calls `i18n.use(initReactI18next).init(...)`.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "5",
    participantId: "2",
    participantName: "Ana Lopes",
    lastMessage: "See you Monday",
    lastMessageAt: "2026-09-25T10:00:00Z",
    unreadCount: 0,
    messages: [],
    ...overrides,
  };
}

const noop = () => {};

describe("ConversationList — unread rows are unmistakable (PAD-414)", () => {
  it("bolds the name and preview, shows the count pill, and flags data-unread on a heavily-unread row", () => {
    render(
      <ConversationList
        conversations={[conversation({ id: "5", unreadCount: 12 })]}
        selectedId={null}
        onSelect={noop}
        onNewConversation={noop}
      />
    );

    const row = screen.getByTestId("conversation-row-5");
    expect(row.getAttribute("data-unread")).toBe("true");
    expect(screen.getByText("9+")).toBeInTheDocument();

    const name = screen.getByText("Ana Lopes");
    expect(name.className).toMatch(/font-semibold/);
    const preview = screen.getByText("See you Monday");
    expect(preview.className).toMatch(/font-semibold/);
  });

  it("shows the exact count under 10", () => {
    render(
      <ConversationList
        conversations={[conversation({ id: "6", unreadCount: 3 })]}
        selectedId={null}
        onSelect={noop}
        onNewConversation={noop}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("a read row is regular weight, has no pill, and data-unread is false", () => {
    render(
      <ConversationList
        conversations={[conversation({ id: "7", unreadCount: 0 })]}
        selectedId={null}
        onSelect={noop}
        onNewConversation={noop}
      />
    );

    const row = screen.getByTestId("conversation-row-7");
    expect(row.getAttribute("data-unread")).toBe("false");

    const name = screen.getByText("Ana Lopes");
    expect(name.className).not.toMatch(/font-semibold/);
    const preview = screen.getByText("See you Monday");
    expect(preview.className).not.toMatch(/font-semibold/);

    // No pill anywhere in this row.
    expect(row.querySelector("[data-testid='unread-pill']")).toBeNull();
  });
});

// PAD-665 (players.search rule 8): a coach's filter uses the shared name rule; a student's keeps
// the plain substring match.
describe("ConversationList filter (PAD-665)", () => {
  const convs = [
    conversation({ id: "1", participantId: "1", participantName: "Ana Rita" }),
    conversation({ id: "2", participantId: "2", participantName: "Rita Zé" }),
    conversation({ id: "3", participantId: "3", participantName: "Rui Pedro Basto" }),
  ];
  const rowIds = (query: string, isCoach: boolean) => {
    const { unmount } = render(
      <ConversationList
        conversations={convs}
        selectedId={null}
        onSelect={noop}
        onNewConversation={noop}
        isCoach={isCoach}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("messages.searchConversationPlaceholder"), {
      target: { value: query },
    });
    const ids = screen
      .queryAllByTestId(/^conversation-row-/)
      .map((el) => el.getAttribute("data-testid")!.replace("conversation-row-", ""));
    unmount();
    return ids;
  };

  it("coach: 'rui basto' finds 'Rui Pedro Basto'; best match first; blank keeps the order", () => {
    expect(rowIds("rui basto", true)).toEqual(["3"]);
    expect(rowIds("rita", true)).toEqual(["2", "1"]);
    expect(rowIds("", true)).toEqual(["1", "2", "3"]);
  });

  it("student: the substring match and the order stay as they were", () => {
    expect(rowIds("rui basto", false)).toEqual([]);
    expect(rowIds("rita", false)).toEqual(["1", "2"]);
  });
});
