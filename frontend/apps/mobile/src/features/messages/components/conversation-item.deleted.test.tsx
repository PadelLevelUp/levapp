/**
 * messaging.conversations rule 12a (PAD-639, B-547), iOS: a row whose last message was deleted
 * shows "Message deleted" in its preview; a live last message shows its text.
 */
import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "@levelup/types";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ConversationItem } from "./conversation-item";

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "5", participantId: "2", participantName: "Ana Lopes", participantRole: "player",
    lastMessage: "See you Monday", lastMessageAt: "2026-09-25T10:00:00Z", unreadCount: 0, messages: [],
    ...overrides,
  } as Conversation;
}

function texts(n: Native): string[] {
  return n.root.root
    .findAll((node) => typeof node.type === "string" && typeof node.props?.children === "string")
    .map((node) => node.props.children as string);
}

describe("ConversationItem — a deleted last message (PAD-639)", () => {
  it("shows the live last message's text", async () => {
    const n = await renderNative(<ConversationItem conversation={conversation({ lastMessageDeleted: false })} onPress={() => {}} />);
    expect(texts(n)).toContain("See you Monday");
    expect(texts(n)).not.toContain("messages.messageDeleted");
  });

  it("shows 'Message deleted' when the last message was deleted", async () => {
    const n = await renderNative(
      <ConversationItem conversation={conversation({ lastMessage: "", lastMessageDeleted: true })} onPress={() => {}} />
    );
    expect(texts(n)).toContain("messages.messageDeleted");
  });
});
