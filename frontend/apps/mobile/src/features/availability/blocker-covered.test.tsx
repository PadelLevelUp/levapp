/**
 * calendar.student-blockers rules 21 and 25 (PAD-772) on iOS: the availability tab asks after a block is
 * saved when the save answers covered classes, and only a yes marks them; same dialog, test ids and
 * requests as web. The sheet and the mutations are stand-ins; the dialog, the shared decision and the
 * API call are real. `t` returns the key (with the count or title when there is one).
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}), router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number; title?: string }) =>
      o?.count !== undefined ? `${key}:${o.count}` : o?.title ? `${key}:${o.title}` : key,
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
// The dialog primitives as plain views: shown while `open`, the buttons press their handlers.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children);
  const button = (p: { children?: React.ReactNode; testID?: string; onPress?: () => void }) =>
    React.createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children);
  return {
    AlertDialog: (p: { open: boolean; children?: React.ReactNode }) => (p.open ? React.createElement(View, null, p.children) : null),
    AlertDialogContent: box, AlertDialogHeader: box, AlertDialogFooter: box, AlertDialogTitle: box, AlertDialogDescription: box,
    AlertDialogCancel: button, AlertDialogAction: button,
  };
});
// The sheet: one button that submits what the shell would.
vi.mock("@/features/availability/BlockerSheet", async () => {
  const { Pressable } = await import("react-native");
  return {
    BlockerSheet: (p: { open: boolean; onSubmit: (payload: unknown) => void }) =>
      p.open ? React.createElement(Pressable, { testID: "blocker-save", onPress: () => p.onSubmit({ date: "2026-12-02", startTime: "08:00", endTime: "09:00", isRecurring: false }) }) : null,
  };
});
const blockerApi = vi.hoisted(() => ({ createBlocker: vi.fn(), declineCoveredClasses: vi.fn(), listBlockers: vi.fn() }));
vi.mock("@levelup/api/src/resources/availability", async (orig) => ({ ...(await orig<object>()), ...blockerApi }));

import AvailabilityScreen from "../../../app/(tabs)/availability";

const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue = { model: "LessonInstance", originalId: 9, date: "2026-12-08", title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };
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

describe("the covered-classes dialog on the iOS availability tab (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-25] asks after the save and marks only on yes", async () => {
    blockerApi.declineCoveredClasses.mockResolvedValue({
      declined: [
        { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 1 },
        { model: "LessonInstance", originalId: 9, date: "2026-12-08", lessonInstanceId: 9 },
      ],
      skipped: [],
    });
    // Keep: the dialog lists both in order and closes with nothing sent.
    let n = await saveABlock({ coveredClasses: [wed, tue] });
    expect(n.queryByTestId("blocker-covered-dialog")).not.toBeNull();
    const json = JSON.stringify(n.root.toJSON());
    expect(json.indexOf("availability.covered.item:Quarta")).toBeGreaterThan(-1);
    expect(json.indexOf("availability.covered.item:Quarta")).toBeLessThan(json.indexOf("availability.covered.item:Terça"));
    expect(n.queryByTestId("blocker-covered-item-0")).not.toBeNull();
    expect(n.queryByTestId("blocker-covered-item-1")).not.toBeNull();
    await n.press("blocker-covered-keep");
    await n.flush();
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(blockerApi.declineCoveredClasses).not.toHaveBeenCalled();

    // Yes: both occurrences are posted, the count is toasted, the calendar and dashboard are re-read.
    const invalidate = vi.spyOn(client, "invalidateQueries");
    n = await saveABlock({ coveredClasses: [wed, tue] });
    await n.press("blocker-covered-decline");
    await n.flush();
    expect(blockerApi.declineCoveredClasses).toHaveBeenCalledWith({
      occurrences: [
        { model: "Lesson", originalId: 7, date: "2026-12-02" },
        { model: "LessonInstance", originalId: 9, date: "2026-12-08" },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith("availability.covered.marked:2");
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["calendar-events"]', '["dashboard"]']));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-25] no covered classes shows no dialog; a failed mark errors and leaves the block saved", async () => {
    let n = await saveABlock({ coveredClasses: [] });
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    n = await saveABlock({}); // an older server sends no key
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();

    blockerApi.declineCoveredClasses.mockRejectedValue(new Error("network"));
    n = await saveABlock({ coveredClasses: [wed] });
    await n.press("blocker-covered-decline");
    await n.flush();
    expect(toast.error).toHaveBeenCalledWith("availability.covered.failed");
    expect(n.queryByTestId("blocker-card-5")).not.toBeNull(); // still listed
  });
});
