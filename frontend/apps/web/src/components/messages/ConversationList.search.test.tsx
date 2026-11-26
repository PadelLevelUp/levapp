/**
 * PAD-831 — messaging.conversations rule 20: a coach's search on the Messages tab finds every
 * person they may message. A matched person with no loaded row is a start row; pressing it hands
 * their user id to the page, which finds or creates the conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Conversation, User } from "@/types";
import MessagesPage from "@/pages/MessagesPage";
import { ConversationList } from "./ConversationList";

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCoachDisplayNameByUser: () => (_id: unknown, fallback: string | null | undefined) => fallback ?? "",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { query?: string }) => (opts?.query ? `${key}:${opts.query}` : key),
    i18n: { language: "pt" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// The page's own surroundings: what it needs to mount, nothing it decides.
const api = vi.hoisted(() => ({ createConversation: vi.fn(), getConversations: vi.fn(), getMessageableUsers: vi.fn() }));
vi.mock("@/api/messages", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createConversation: api.createConversation,
  getConversation: async (id: string) => ({ id, messages: [], hasMore: false }),
  markConversationRead: async () => {},
}));
vi.mock("@levelup/api/src/resources/messages", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getConversations: api.getConversations,
}));
vi.mock("@/api/users", () => ({ getMessageableUsers: api.getMessageableUsers }));
vi.mock("@levelup/api/src/resources/players", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getCoachPlayers: async () => [],
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, roles: ["coach"] }, token: "t" }) }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/layout/LayoutContext", () => ({ useLayout: () => ({ setScrollMode: () => {}, refreshUnreadCount: () => {} }) }));
vi.mock("@/components/messages/ChatThread", () => ({ ChatThread: () => null }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => {} }));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ isSupported: false, permission: "default", isSubscribed: false, saveState: "idle", subscribe: () => {} }),
}));

const conv = (id: string, participantId: string, participantName: string): Conversation => ({
  id,
  participantId,
  participantName,
  lastMessage: "hi",
  lastMessageAt: "2026-11-25T10:00:00Z",
  unreadCount: 0,
  messages: [],
});
const person = (id: number, name: string) => ({ id, name, abbreviation: "" }) as unknown as User;
const EGOR = person(41, "Egor Petrov");
const EURICO = person(42, "Eurico Gonçalves");
const noop = () => {};

const renderList = (props: Partial<React.ComponentProps<typeof ConversationList>> = {}) =>
  render(
    <ConversationList
      conversations={[conv("1", "11", "Ana Lopes"), conv("2", "12", "Rui Basto")]}
      selectedId={null}
      onSelect={noop}
      onNewConversation={noop}
      filter="all"
      onFilterChange={noop}
      isCoach
      people={[EGOR, EURICO, person(11, "Ana Lopes")]}
      {...props}
    />
  );
const type = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText("messages.searchConversationPlaceholder"), { target: { value: text } });
const starts = () => screen.queryAllByTestId(/^conversation-start-\d+$/).map((e) => e.dataset.testid);
const rows = () => screen.queryAllByTestId(/^conversation-row-/).map((e) => e.dataset.testid);

beforeEach(() => {
  api.createConversation.mockReset().mockResolvedValue(conv("77", "41", "Egor Petrov"));
  api.getConversations.mockReset().mockResolvedValue({ conversations: [conv("1", "11", "Ana Lopes")], hasMore: false });
  api.getMessageableUsers.mockReset().mockResolvedValue([EGOR, EURICO]);
});

describe("ConversationList — a coach's search (PAD-831)", () => {
  it("[MESSAGING-CONVERSATIONS-34] a student whose conversation is not loaded is found and reopened", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/messages"]}>
          <MessagesPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByTestId("conversation-row-1");
    await waitFor(() => expect(api.getMessageableUsers).toHaveBeenCalled());
    type("egor");
    await screen.findByTestId("conversation-start-41");
    expect(rows()).toEqual([]);
    expect(starts()).toEqual(["conversation-start-41"]);

    api.createConversation.mockRejectedValueOnce({ response: { status: 403 } });
    fireEvent.click(screen.getByTestId("conversation-start-41"));
    expect(await screen.findByTestId("conversation-start-error")).toHaveTextContent("messages.cannotMessageUser");
    expect(starts()).toEqual(["conversation-start-41"]);

    fireEvent.click(screen.getByTestId("conversation-start-41"));
    // The server answers the conversation that was not loaded: its row replaces the start row.
    expect(await screen.findByTestId("conversation-row-77")).toBeInTheDocument();
    expect(starts()).toEqual([]);
    expect(api.createConversation).toHaveBeenLastCalledWith({ otherParticipants: ["41"] });
  });

  it("[MESSAGING-CONVERSATIONS-35] a student with no conversation is found by name or surname, any case or accent", async () => {
    const onNewConversation = vi.fn();
    renderList({ onNewConversation });
    for (const q of ["eurico", "EURICO", "goncalves", "eur gon"]) {
      type(q);
      expect(starts(), q).toEqual(["conversation-start-42"]);
      expect(screen.getByTestId("conversation-start-42")).toHaveTextContent("messages.startConversationRow");
    }
    fireEvent.click(screen.getByTestId("conversation-start-42"));
    await waitFor(() => expect(onNewConversation).toHaveBeenCalledWith("42"));
  });

  it("[MESSAGING-CONVERSATIONS-38] blank, unread-only and not-found keep their behaviour", () => {
    const { unmount } = renderList();
    type("  ");
    expect(rows()).toEqual(["conversation-row-1", "conversation-row-2"]);
    expect(starts()).toEqual([]);
    type("xavier");
    expect(rows()).toEqual([]);
    expect(starts()).toEqual([]);
    expect(screen.getByTestId("player-search-empty")).toHaveTextContent("players.search.noResults:xavier");
    unmount();

    renderList({ filter: "unread" });
    type("egor");
    expect(starts()).toEqual([]);
  });

  it("[MESSAGING-CONVERSATIONS-40] a student's search offers no start row", () => {
    renderList({ isCoach: false, people: [person(50, "Rui Coach")] });
    type("rui");
    expect(rows()).toEqual(["conversation-row-2"]);
    expect(starts()).toEqual([]);
  });
});
