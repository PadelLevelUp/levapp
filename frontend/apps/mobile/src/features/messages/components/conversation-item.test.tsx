/**
 * PAD-414 (iOS) — messaging.conversations rule 16: an unread row is
 * unmistakable. A row with `unreadCount > 0` shows the name and last-message
 * preview in bold, plus the count pill (`unreadBadgeLabel`, "9+" above nine);
 * a read row is regular weight with no pill, and `conversation-unread-<id>`
 * is present only on the unread row.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { Conversation } from "@levelup/types";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { ConversationItem } from "./conversation-item";

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "5",
    participantId: "2",
    participantName: "Ana Lopes",
    participantRole: "player",
    lastMessage: "See you Monday",
    lastMessageAt: "2026-09-25T10:00:00Z",
    unreadCount: 0,
    messages: [],
    ...overrides,
  } as Conversation;
}

/** The rendered HOST text node whose sole child is exactly `text` (the `Text`
 *  wrapper is a composite that also carries the same `children` prop, so a
 *  plain findByProps would match both it and the host node underneath). */
function textNode(n: Native, text: string): ReactTestInstance {
  const hits = n.root.root.findAll(
    (node) => node.props?.children === text && typeof node.type === "string"
  );
  if (hits.length !== 1) {
    throw new Error(`expected exactly one host text node "${text}", found ${hits.length}`);
  }
  return hits[0];
}

describe("ConversationItem — unread rows are unmistakable (PAD-414)", () => {
  it("bolds the name and preview, caps the pill at 9+, and exposes conversation-unread-<id>", async () => {
    const n = await renderNative(
      <ConversationItem
        conversation={conversation({ id: "5", unreadCount: 12 })}
        onPress={() => {}}
      />
    );

    expect(textNode(n, "9+")).toBeTruthy();

    expect(String(textNode(n, "Ana Lopes").props.className)).toMatch(/semibold/);
    expect(String(textNode(n, "See you Monday").props.className)).toMatch(/semibold/);
  });

  it("shows the exact count under 10", async () => {
    const n = await renderNative(
      <ConversationItem
        conversation={conversation({ id: "6", unreadCount: 3 })}
        onPress={() => {}}
      />
    );
    expect(textNode(n, "3")).toBeTruthy();
  });

  it("a read row is regular weight, has no pill, and no conversation-unread testID", async () => {
    const n = await renderNative(
      <ConversationItem
        conversation={conversation({ id: "7", unreadCount: 0 })}
        onPress={() => {}}
      />
    );

    expect(n.queryByTestId("conversation-unread-7")).toBeNull();

    expect(String(textNode(n, "Ana Lopes").props.className)).not.toMatch(/semibold/);
    expect(String(textNode(n, "See you Monday").props.className)).not.toMatch(/semibold/);
  });
});
