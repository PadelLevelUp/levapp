/**
 * PAD-592 — mobile.interaction-performance rule 1: a bubble whose props have not changed does not
 * render again when its parent does. The thread screen's composer keeps the draft out of the
 * list's component and hands each row stable handlers; this pins the other half — the memo — by
 * counting the dev-only `[render] bubble` line the simulator measurement reads.
 */
import * as React from "react";
import type { Message } from "@levelup/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
// The harness has no native gesture or animation runtime: a chainable gesture stub and plain
// values are enough for the bubble to mount (the memo, not the swipe, is under test).
vi.mock("react-native-gesture-handler", () => {
  // Every builder method (`.activeOffsetX()`, `.onEnd()`, …) returns the builder.
  const chain: unknown = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain, LongPress: () => chain, Race: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (f: () => unknown) => f(),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    interpolate: (v: number) => v,
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
    Layout: { duration: () => undefined },
    runOnJS: (f: (...a: unknown[]) => unknown) => f,
  };
});
vi.mock("@/features/notifications/replacement-approval-card", () => ({ ReplacementApprovalCard: () => null }));

import { MessageBubble } from "./message-bubble";

const message: Message = {
  id: "41",
  conversationId: "5",
  senderId: "2",
  content: "Olá",
  type: "text",
  createdAt: "2026-10-10T10:00:00Z",
  status: "sent",
} as unknown as Message;

function Parent({ tick, onReply }: { tick: number; onReply: (m: Message) => void }) {
  return (
    <>
      <MessageBubble message={message} own={false} userId={1} participantName="Ana" onReply={onReply} />
      {tick}
    </>
  );
}

describe("MessageBubble is memoised (PAD-592)", () => {
  const g = globalThis as { __DEV__?: boolean };
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    g.__DEV__ = true;
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    delete g.__DEV__;
  });
  const renders = () => log.mock.calls.filter((c) => c[0] === "[render] bubble").length;

  it("a parent re-render with the same props does not render the bubble again", async () => {
    const onReply = vi.fn();
    const n = await renderNative(<Parent tick={1} onReply={onReply} />);
    const before = renders();
    expect(before).toBeGreaterThan(0);
    await n.rerender(<Parent tick={2} onReply={onReply} />);
    expect(renders()).toBe(before);
  });

  it("a changed prop still renders it", async () => {
    const n = await renderNative(<Parent tick={1} onReply={vi.fn()} />);
    const before = renders();
    await n.rerender(<Parent tick={2} onReply={vi.fn()} />);
    expect(renders()).toBe(before + 1);
  });
});
