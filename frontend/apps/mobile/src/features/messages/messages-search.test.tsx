/**
 * PAD-831 (iOS) — messaging.conversations rule 20: a coach's search on the Messages tab finds every
 * person they may message. A matched person with no loaded row is a start row; tapping it finds or
 * creates the conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Conversation } from "@levelup/types";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { query?: string }) => (opts?.query ? `${key}:${opts.query}` : key),
    i18n: { language: "pt" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
const router = vi.hoisted(() => ({ push: vi.fn(), navigate: vi.fn(), dismissTo: vi.fn(), canDismiss: () => false }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router, useFocusEffect: (effect: () => void) => useEffect(() => effect(), [effect]) };
});
const auth = vi.hoisted(() => ({ roles: ["coach"] }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, roles: auth.roles } }) }));
const row = (id: string, participantId: string, participantName: string): Conversation =>
  ({
    id,
    participantId,
    participantName,
    participantRole: "player",
    lastMessage: "hi",
    lastMessageAt: `2026-11-25T1${id}:00:00Z`,
    unreadCount: 0,
    messages: [],
  }) as Conversation;

const server = vi.hoisted(() => ({
  all: [] as unknown[],
  unread: [] as unknown[],
  people: [] as unknown[],
  create: vi.fn(),
  people_calls: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/messages", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConversations: async (_p: number, _l: number, unread = false) => ({
    conversations: unread ? server.unread : server.all,
    hasMore: true,
  }),
}));
vi.mock("@levelup/api/src/resources/users", () => ({
  getMessageableUsers: async () => {
    server.people_calls();
    return server.people;
  },
}));
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [],
}));
vi.mock("@levelup/api", () => ({
  messagesApi: { getConversations: vi.fn(), createConversation: (...a: unknown[]) => server.create(...a) },
}));

import MessagesScreen from "../../../app/(tabs)/messages";

const EGOR = { id: 41, name: "Egor Petrov", abbreviation: "EP" };
const EURICO = { id: 42, name: "Eurico Gonçalves", abbreviation: "EG" };

const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const n = await renderNative(
    createElement(QueryClientProvider, { client }, createElement(MessagesScreen))
  );
  await n.flush();
  await n.flush();
  return n;
};

type Item = { id?: string; startUser?: { id: number; name: string } };
const list = (n: Native) => n.root.root.findAll((x) => (x.type as unknown) === "FlatList")[0];
/** What the list is handed, in order. The test FlatList is a host stub that never calls `renderItem`. */
const shown = (n: Native) =>
  ((list(n)?.props.data ?? []) as Item[]).map((i) => (i.startUser ? `start-${i.startUser.id}` : `row-${i.id}`));
const renderStart = (n: Native, userId: number) => {
  const item = (list(n).props.data as Item[]).find((i) => i.startUser?.id === userId);
  return renderNative(list(n).props.renderItem({ item }));
};
const type = (n: Native, text: string) => n.changeText("conversations-search", text);

beforeEach(() => {
  auth.roles = ["coach"];
  server.all = [row("1", "11", "Ana Lopes"), row("2", "12", "Rui Basto")];
  server.unread = [row("1", "11", "Ana Lopes")];
  server.people = [EGOR, EURICO, { id: 11, name: "Ana Lopes", abbreviation: "AL" }];
  server.create.mockReset().mockResolvedValue({ id: "77" });
  server.people_calls.mockReset();
  router.push.mockReset();
});

describe("Messages tab — a coach's search (PAD-831)", () => {
  it("[MESSAGING-CONVERSATIONS-34] a student whose conversation is not loaded is found and reopened", async () => {
    const n = await mount();
    await type(n, "egor");
    expect(shown(n)).toEqual(["start-41"]);

    const start = await renderStart(n, 41);
    await start.press("conversation-start-41");
    await n.flush();
    expect(server.create).toHaveBeenCalledWith({ otherParticipants: ["41"] });
    expect(router.push).toHaveBeenCalledWith("/conversation/77");

    server.create.mockRejectedValue({ response: { status: 403 } });
    await (await renderStart(n, 41)).press("conversation-start-41");
    await n.flush();
    expect(n.byTestId("conversation-start-error").props.children).toBe("messages.cannotMessageUser");
    expect(shown(n)).toEqual(["start-41"]);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("[MESSAGING-CONVERSATIONS-35] a student with no conversation is found by name or surname, any case or accent", async () => {
    const n = await mount();
    for (const q of ["eurico", "EURICO", "goncalves", "eur gon"]) {
      await type(n, q);
      expect(shown(n), q).toEqual(["start-42"]);
    }
    const start = await renderStart(n, 42);
    const printed = JSON.stringify(start.root.toJSON());
    expect(printed).toContain("messages.startConversation");
    expect(printed).toContain("Eurico Gonçalves");
    await start.press("conversation-start-42");
    await n.flush();
    expect(router.push).toHaveBeenCalledWith("/conversation/77");
    // Read once for the visit, not per keystroke.
    expect(server.people_calls).toHaveBeenCalledTimes(1);
  });

  it("[MESSAGING-CONVERSATIONS-38] blank, unread-only and not-found keep their behaviour", async () => {
    const n = await mount();
    expect(shown(n)).toEqual(["row-2", "row-1"]);
    await type(n, "  ");
    expect(shown(n)).toEqual(["row-2", "row-1"]);

    await n.press("conversations-filter-unread");
    await n.flush();
    await type(n, "egor");
    expect(shown(n)).toEqual([]);

    await n.press("conversations-filter-all");
    await n.flush();
    await type(n, "xavier");
    expect(shown(n)).toEqual([]);
    expect(n.byTestId("player-search-empty").props.children).toBe("players.search.noResults:xavier");
  });

  it("[MESSAGING-CONVERSATIONS-39] a coach with no conversation sees the box and finds a student", async () => {
    server.all = [];
    const n = await mount();
    expect(n.queryByTestId("conversations-search")).not.toBeNull();
    expect(n.queryByTestId("conversations-empty-none")).not.toBeNull();
    await type(n, "egor");
    expect(shown(n)).toEqual(["start-41"]);
    expect(n.queryByTestId("conversations-empty-none")).toBeNull();
  });

  it("[MESSAGING-CONVERSATIONS-40] a student's search offers no start row", async () => {
    auth.roles = ["player"];
    server.people = [{ id: 50, name: "Rui Coach", abbreviation: "RC" }];
    const n = await mount();
    await type(n, "rui");
    expect(shown(n)).toEqual(["row-2"]);
    expect(server.people_calls).not.toHaveBeenCalled();
  });
});
