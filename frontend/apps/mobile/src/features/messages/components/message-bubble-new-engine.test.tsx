/**
 * PAD-920 — notifications.invitations NB1, NB2, NB4 on iOS: the new-engine invitation bubble renders
 * every state from the shared `engineInviteState`, with the test ids web uses
 * (`invite-respond-yes|no-<invitationId>`, `invite-state-<invitationId>-<state>`). An old-engine
 * bubble keeps its own ids. Labels are asserted by their i18n key (the `t` mock returns the key).
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@levelup/types";
import { act, type ReactTestInstance } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative, type Native } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/lib/haptics", () => ({ lightImpact: () => {} }));
vi.mock("react-native-gesture-handler", () => {
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
    runOnJS: (f: (...a: unknown[]) => unknown) => f,
  };
});
vi.mock("@/features/notifications/replacement-approval-card", () => ({ ReplacementApprovalCard: () => null }));

import { MessageBubble } from "./message-bubble";

const NOW = new Date("2026-11-12T10:00:00Z");
const LATER = "2026-11-12T18:00:00Z"; // the class starts after NOW
const EARLIER = "2026-11-12T09:00:00Z";

function invite(id: number, metadata: Record<string, unknown>, extra: Partial<Message> = {}): Message {
  return {
    id: String(id),
    conversationId: "5",
    senderId: "2",
    content: "Convite",
    type: "text",
    createdAt: "2026-11-12T08:00:00Z",
    status: "sent",
    messageType: "notification_invite",
    metadata,
    ...extra,
  } as unknown as Message;
}

const engine = (invitationId: number, rest: Record<string, unknown>) => ({
  engine: "new",
  invitationId,
  lessonInstanceId: 900,
  kind: "invite",
  startsAt: LATER,
  ...rest,
});

function texts(node: ReactTestInstance): string[] {
  return node.children.flatMap((c) => (typeof c === "string" ? [c] : texts(c)));
}

let client: QueryClient;
async function mount(message: Message, own: boolean, onRespondInvite?: (a: "yes" | "no") => void): Promise<Native> {
  return renderNative(
    React.createElement(
      QueryClientProvider,
      { client },
      <MessageBubble message={message} own={own} userId={1} participantName="Ana" onRespondInvite={onRespondInvite} />
    )
  );
}

/** The state row carries its id; Yes/No show only when expected, with the given label otherwise. */
async function expectState(
  message: Message,
  own: boolean,
  invitationId: number,
  state: string,
  label: string | null,
  buttons: boolean
) {
  const r = await mount(message, own);
  const row = r.byTestId(`invite-state-${invitationId}-${state}`);
  expect(!!r.queryByTestId(`invite-respond-yes-${invitationId}`)).toBe(buttons);
  expect(!!r.queryByTestId(`invite-respond-no-${invitationId}`)).toBe(buttons);
  if (label) expect(texts(row)).toContain(label);
  // Never the old engine's ids on a new-engine bubble.
  expect(r.queryByTestId("message-respond-yes")).toBeNull();
  expect(r.queryByTestId("invite-accepted")).toBeNull();
  r.root.unmount();
}

describe("the iOS new-engine invitation bubble (PAD-920)", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it("[NOTIFICATIONS-INVITATIONS-117] renders the new engine's states with the shared test ids", async () => {
    // NB2, the student's copy. `open`: Yes and No, and they answer by the invitation.
    const onRespond = vi.fn();
    const open = await mount(invite(1, engine(11, { state: "open" })), false, onRespond);
    open.byTestId("invite-state-11-open");
    await open.press("invite-respond-yes-11");
    await open.press("invite-respond-no-11");
    expect(onRespond.mock.calls).toEqual([["yes"], ["no"]]);
    open.root.unmount();

    // `answered`: today's labels, and "by the coach" when the coach recorded it.
    await expectState(invite(2, engine(12, { state: "answered", response: "yes", answeredBy: "student" })), false, 12, "answered", "messages.accepted", false);
    await expectState(invite(3, engine(13, { state: "answered", response: "no", answeredBy: "student" })), false, 13, "answered", "messages.declined", false);
    await expectState(invite(4, engine(14, { state: "answered", response: "yes", answeredBy: "coach" })), false, 14, "answered", "messages.acceptedByCoach", false);
    await expectState(invite(5, engine(15, { state: "answered", response: "no", answeredBy: "coach" })), false, 15, "answered", "messages.declinedByCoach", false);

    // `sorry`: a Yes that lost the spot reads sorry, never "declined".
    const sorry = await mount(invite(6, engine(16, { state: "sorry", response: "yes" })), false);
    expect(texts(sorry.byTestId("invite-state-16-sorry"))).toEqual(["messages.engineInvite.sorry"]);
    expect(sorry.queryByTestId("invite-respond-yes-16")).toBeNull();
    sorry.root.unmount();

    // `reopened` (a student who joined the waiting list after a sorry): the first bubble points below;
    // the `waiting_list_invite` bubble for the same invitation has Yes and No.
    await expectState(invite(7, engine(17, { state: "reopened" })), false, 17, "reopened", "messages.engineInvite.reopened", false);
    await expectState(invite(8, engine(17, { kind: "waiting_list_invite", state: "open" })), false, 17, "open", null, true);

    await expectState(invite(9, engine(18, { state: "withdrawn" })), false, 18, "withdrawn", "messages.engineInvite.withdrawn", false);
    await expectState(invite(10, engine(19, { state: "closed_same_hour" })), false, 19, "closed_same_hour", "messages.engineInvite.closedSameHour", false);

    // Once the class has started (derived from startsAt), no buttons, whatever the stored state.
    await expectState(invite(11, engine(20, { state: "open", startsAt: EARLIER })), false, 20, "started", "messages.engineInvite.classStarted", false);

    // NB3, the coach's copy (their own message): open and counting, open and no longer counting.
    await expectState(invite(12, engine(21, { state: "open", countsUntil: LATER })), true, 21, "open", "messages.waitingForResponse", false);
    await expectState(invite(13, engine(22, { state: "open", countsUntil: EARLIER })), true, 22, "open", "messages.engineInvite.notCounting", false);
    // The coach's copy of any other state reads the student's label, never with buttons.
    await expectState(invite(16, engine(23, { state: "sorry", response: "yes" })), true, 23, "sorry", "messages.engineInvite.sorry", false);

    // An old-engine invitation renders exactly as before, with its own ids.
    const oldOpen = await mount(invite(14, { notificationEventId: 77, lessonInstanceId: 900 }), false, onRespond);
    oldOpen.byTestId("message-respond-yes");
    oldOpen.byTestId("message-respond-no");
    expect(oldOpen.root.root.findAll((n) => typeof n.props?.testID === "string" && n.props.testID.startsWith("invite-state-"))).toHaveLength(0);
    oldOpen.root.unmount();
    const oldAnswered = await mount(invite(15, { notificationEventId: 78, responded: true, response: "yes" }), false);
    expect(texts(oldAnswered.byTestId("invite-accepted"))).toEqual(["messages.accepted"]);
    oldAnswered.root.unmount();
  });

  it("[NOTIFICATIONS-INVITATIONS-117] an open bubble left on screen turns started at the class's start (NB1)", async () => {
    // beforeEach fakes Date only; this case also needs the timers.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    const startsAt = new Date(NOW.getTime() + 60_000).toISOString();
    const r = await mount(invite(17, engine(24, { state: "open", startsAt })), false);
    r.byTestId("invite-respond-yes-24");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    r.byTestId("invite-state-24-started");
    expect(r.queryByTestId("invite-respond-yes-24")).toBeNull();
    r.root.unmount();
  });

  it("renders an engine_alert as text with a link to its native class screen (dashboard.blocks NA3)", async () => {
    const alert = invite(30, { engine: "new", lessonInstanceId: 901, reason: "no_candidate", count: 1 }, { messageType: "engine_alert", content: "Nobody left" });
    const onOpenClass = vi.fn();
    const r = await renderNative(
      React.createElement(QueryClientProvider, { client }, <MessageBubble message={alert} own={false} onOpenClass={onOpenClass} />)
    );
    expect(texts(r.byTestId("message-item-30"))).toContain("Nobody left");
    await r.press("engine-alert-open-class-30");
    expect(onOpenClass).toHaveBeenCalledWith({ pathname: "/class/[id]", params: { id: "lessoninstance-901" } });
    r.root.unmount();
  });

  it("renders engine_side_moved and added_to_class as plain text, and the engine's sorry as the waiting-list offer", async () => {
    for (const messageType of ["engine_side_moved", "added_to_class"]) {
      const r = await mount(invite(31, { engine: "new", lessonInstanceId: 901, side: "left" }, { messageType, content: "Plain" }), false);
      expect(texts(r.byTestId("message-item-31"))).toContain("Plain");
      expect(r.root.root.findAll((n) => n.props?.role === "button" || n.props?.role === "link")).toHaveLength(0);
      r.root.unmount();
    }
    const onWaitingList = vi.fn();
    const sorry = await renderNative(
      React.createElement(
        QueryClientProvider,
        { client },
        <MessageBubble
          message={invite(32, { engine: "new", invitationId: 40, lessonInstanceId: 901 }, { messageType: "waiting_list_offer" })}
          own={false}
          onRespondWaitingList={onWaitingList}
        />
      )
    );
    await sorry.press("message-waiting-list-yes");
    expect(onWaitingList).toHaveBeenCalledWith("yes");
    sorry.root.unmount();
  });
});
