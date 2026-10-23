/**
 * PAD-648 (iOS) — messaging.conversations rule 17: "Todas" / "Não lidas" above the Messages tab's
 * list. "Não lidas" is the server's list (`useConversations(…, unread)`), not a filter over the
 * loaded rows; switching starts again from page 1; the controls stay when nothing is unread.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Conversation } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
// PAD-665: the tab reads the viewer's role for its search (players.search rule 8); a student here.
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, roles: ["player"] } }) }));

const row = (id: string, unreadCount: number): Conversation =>
  ({
    id,
    participantId: `p${id}`,
    participantName: `Person ${id}`,
    participantRole: "player",
    lastMessage: "hi",
    lastMessageAt: `2026-10-14T1${id}:00:00Z`,
    unreadCount,
    messages: [],
  }) as Conversation;

const lists: Record<"all" | "unread", Conversation[]> = { all: [], unread: [] };
// Real @levelup/hooks since PAD-406: `useConversations` runs for real over this api spy.
const getConversations = vi.fn(async (_page: number, _limit: number, unread = false) => ({
  conversations: unread ? lists.unread : lists.all,
  hasMore: false,
}));
vi.mock("@levelup/api/src/resources/messages", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConversations: (...a: [number, number, boolean?]) => getConversations(...a),
}));
vi.mock("@levelup/api", () => ({ messagesApi: { getConversations: vi.fn() } }));

import MessagesScreen from "../../../app/(tabs)/messages";

let client: QueryClient;
const mount = async (el: ReactElement) => {
  const n = await renderNative(createElement(QueryClientProvider, { client }, el));
  await n.flush(); // the first page lands
  return n;
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  getConversations.mockClear();
  lists.all = [row("1", 2), row("2", 0)];
  lists.unread = [row("1", 2)];
});

/** The ids the list is handed. The test FlatList is a host stub that never calls `renderItem`. */
const shownIds = (n: Awaited<ReturnType<typeof renderNative>>) =>
  (n.root.root.findAll((x) => (x.type as unknown) === "FlatList")[0]?.props.data ?? []).map(
    (c: Conversation) => `conversation-item-${c.id}`
  );

describe("Messages tab — the unread filter (PAD-648)", () => {
  it("starts on Todas, and Não lidas asks the server for the unread list", async () => {
    const n = await mount(createElement(MessagesScreen));
    expect(n.byTestId("conversations-filter-all").props.accessibilityState).toEqual({ selected: true });
    expect(getConversations).toHaveBeenLastCalledWith(1, 20, false);
    expect(shownIds(n)).toEqual(["conversation-item-2", "conversation-item-1"]);

    await n.press("conversations-filter-unread");
    await n.flush(); // the other list lands
    expect(getConversations).toHaveBeenLastCalledWith(1, 20, true);
    expect(n.byTestId("conversations-filter-unread").props.accessibilityState).toEqual({ selected: true });
    expect(shownIds(n)).toEqual(["conversation-item-1"]);

    await n.press("conversations-filter-all");
    await n.flush(); // the other list lands
    expect(shownIds(n)).toEqual(["conversation-item-2", "conversation-item-1"]);
  });

  it("keeps the controls and says so when nothing is unread", async () => {
    lists.unread = [];
    const n = await mount(createElement(MessagesScreen));
    await n.press("conversations-filter-unread");
    await n.flush(); // the other list lands
    expect(n.queryByTestId("conversations-filter-all")).not.toBeNull();
    expect(n.byTestId("conversations-empty-unread")).toBeTruthy();
    expect(n.queryByTestId("conversations-empty-none")).toBeNull();
  });
});
