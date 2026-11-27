/**
 * attendance.confirm rule 32 on iOS: the reminder bubble offers "Afinal vou" only while the `comeBack`
 * served on the reminder message says a place is free; otherwise it says plainly the place went.
 * Same test ids as web (`bubble-come-back*`); `t` returns the key.
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@levelup/types";
import { mergeEditedMessage } from "@levelup/api";
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
const waitingListApi = vi.hoisted(() => ({
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
  listClassWaitingList: vi.fn(() => Promise.resolve([] as unknown[])),
  leaveClassWaitingList: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/academyClasses", () => waitingListApi);

import { MessageBubble } from "./message-bubble";

const NOW = new Date("2026-11-27T10:00:00Z");
const LATER = "2026-11-28T18:00:00"; // the class has not started

function reminder(comeBack?: Message["comeBack"] | "absent", metadata: Record<string, unknown> = {}): Message {
  const m = {
    id: "1",
    conversationId: "5",
    senderId: 2,
    content: "Vens à aula?",
    timestamp: "2026-11-26T18:00:00Z",
    isRead: true,
    status: "read",
    messageType: "notification_reminder",
    metadata: { lessonInstanceId: 7, responded: true, response: "no", startsAt: LATER, ...metadata },
  } as Message;
  return comeBack === "absent" ? m : { ...m, comeBack };
}

let client: QueryClient;
const element = (message: Message, onRespondReminder?: (a: "yes" | "no") => Promise<string | null>) =>
  React.createElement(
    QueryClientProvider,
    { client },
    <MessageBubble message={message} own={false} userId={1} participantName="Coach" onRespondReminder={onRespondReminder} />
  );
const mount = (message: Message, onRespondReminder?: (a: "yes" | "no") => Promise<string | null>): Promise<Native> =>
  renderNative(element(message, onRespondReminder));
const shown = (r: Native) => ({
  button: !!r.queryByTestId("bubble-come-back"),
  spotTaken: !!r.queryByTestId("bubble-come-back-spot-taken"),
  join: !!r.queryByTestId("bubble-come-back-waiting-list"),
  onList: !!r.queryByTestId("bubble-come-back-on-waiting-list"),
});

describe("the iOS reminder bubble follows the served comeBack (rule 32)", () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    waitingListApi.joinClassWaitingList.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  it('[ATTENDANCE-CONFIRM-46] the bubble offers "Afinal vou" only for rejoin', async () => {
    const cases = [
      ["rejoin", { button: true, spotTaken: false, join: false, onList: false }],
      ["waiting_list", { button: false, spotTaken: true, join: true, onList: false }],
      ["on_waiting_list", { button: false, spotTaken: false, join: false, onList: true }],
      [null, { button: false, spotTaken: false, join: false, onList: false }],
    ] as const;
    for (const [comeBack, expected] of cases) {
      const r = await mount(reminder(comeBack));
      expect({ comeBack, ...shown(r) }).toEqual({ comeBack, ...expected });
      r.root.unmount();
    }
  });

  it("[ATTENDANCE-CONFIRM-46] waiting_list: the join is for the reminder's occurrence, then the list state", async () => {
    const r = await mount(reminder("waiting_list"));
    await r.press("bubble-come-back-waiting-list");
    await r.flush();
    expect(waitingListApi.joinClassWaitingList).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 });
    expect(shown(r)).toEqual({ button: false, spotTaken: false, join: false, onList: true });
  });

  it("[ATTENDANCE-CONFIRM-46] an older server (no comeBack key) keeps today's button after a recorded no", async () => {
    const r = await mount(reminder("absent"));
    expect(shown(r).button).toBe(true);
    const started = await mount(reminder("absent", { startsAt: "2026-11-27T09:00:00" }));
    expect(shown(started).button).toBe(false);
  });

  it("[ATTENDANCE-CONFIRM-46] a live edit without the key keeps the value last read", async () => {
    const read = reminder("waiting_list");
    const r = await mount(read);
    const { comeBack: _omitted, ...live } = read;
    await r.rerender(element(mergeEditedMessage(read, { ...live, content: "Vens à aula? (editada)" } as Message)));
    expect(shown(r)).toEqual({ button: false, spotTaken: true, join: true, onList: false });
  });

  it("[ATTENDANCE-CONFIRM-46] a tap answered spot_filled moves to the waiting-list line", async () => {
    const onRespond = vi.fn(() => Promise.resolve("spot_filled"));
    const r = await mount(reminder("rejoin"), onRespond);
    await r.press("bubble-come-back");
    await r.flush();
    expect(onRespond).toHaveBeenCalledWith("yes");
    expect(shown(r)).toEqual({ button: false, spotTaken: true, join: true, onList: false });
  });
});
