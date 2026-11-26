/**
 * calendar.student-blockers rules 19 and 21 (PAD-772, owner correction 26 Nov 2026) on iOS: the availability tab
 * saves a block, says how many classes the server marked "Não vai" and asks nothing; same toast and re-read as
 * web. The sheet and the mutations are stand-ins; the shared decision and the hook are real. `t` returns the
 * key (with the count when there is one).
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}), router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number }) => (o?.count !== undefined ? `${key}:${o.count}` : key),
    i18n: { language: "pt" },
  }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/components/screen", async () => {
  const { View } = await import("react-native");
  return { Screen: (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children) };
});
vi.mock("@/features/class-requests/class-requests-section", () => ({ ClassRequestsSection: () => null }));
// The sheet: one button that submits what the shell would.
vi.mock("@/features/availability/BlockerSheet", async () => {
  const { Pressable } = await import("react-native");
  return {
    BlockerSheet: (p: { open: boolean; onSubmit: (payload: unknown) => void }) =>
      p.open ? React.createElement(Pressable, { testID: "blocker-save", onPress: () => p.onSubmit({ date: "2026-12-02", startTime: "08:00", endTime: "09:00", isRecurring: false }) }) : null,
  };
});
const blockerApi = vi.hoisted(() => ({ createBlocker: vi.fn(), listBlockers: vi.fn() }));
vi.mock("@levelup/api/src/resources/availability", async (orig) => ({ ...(await orig<object>()), ...blockerApi }));

import AvailabilityScreen from "../../../app/(tabs)/availability";

const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue = { model: "LessonInstance", originalId: 9, date: "2026-12-08", lessonInstanceId: 9, title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };
const saved = { id: 5, userId: 1, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, blocksAutoInvitations: true, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  blockerApi.listBlockers.mockResolvedValue([saved]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

async function saveABlock(answer: object) {
  blockerApi.createBlocker.mockResolvedValue({ ...saved, ...answer });
  const n = await renderNative(
    <QueryClientProvider client={client}>
      <AvailabilityScreen />
    </QueryClientProvider>
  );
  await n.flush();
  await n.press("availability-create-blocker");
  await n.press("blocker-save");
  await n.flush();
  return n;
}
const keysOf = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

describe("the iOS availability tab after a block save (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-25] a save over classes says how many were marked and asks nothing", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const n = await saveABlock({ markedClasses: [wed, tue], coveredClasses: [] });
    // No dialog, the count toast, no write other than the save, and the calendar and dashboard are read again.
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("availability.covered.marked:2");
    expect(blockerApi.createBlocker).toHaveBeenCalledTimes(1);
    expect(Object.keys(blockerApi).sort()).toEqual(["createBlocker", "listBlockers"]);
    expect(keysOf(invalidate)).toEqual(expect.arrayContaining(['["calendar-events"]', '["dashboard"]']));
    expect(n.queryByTestId("blocker-card-5")).not.toBeNull();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-25] a save answering no marked classes shows only the ordinary save", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    let n = await saveABlock({ markedClasses: [] });
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining("availability.covered"));
    n = await saveABlock({}); // an older server sends no key
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(keysOf(invalidate)).not.toContain('["calendar-events"]');
  });
});
