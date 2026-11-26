/**
 * calendar.student-blockers rules 19-21 and 26, criteria -28 and -32 (PAD-772, owner correction 26 Nov 2026) on
 * iOS: the calendar's block screen (`app/event/[id].tsx`) saves through `PUT /calendar_block/{id}` and, like the
 * availability tab, says how many classes the save marked and asks nothing; a student's blocker form carries the
 * static line, a coach's own block does not. The screen is rendered; the calendar hooks, the sheet's pickers and
 * the dialogs are stand-ins, the shared decision and the follow-up hook are real. `t` returns the key (with the
 * count when there is one).
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "block-5-x", originalId: "5", date: "2026-12-02" }), router: { back: vi.fn(), push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number }) => (o?.count !== undefined ? `${key}:${o.count}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("@/components/screen", async () => {
  const { View } = await import("react-native");
  return { Screen: (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children) };
});
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
vi.mock("@/components/ui/time-picker-input", () => ({ TimePickerInput: () => null }));
vi.mock("@/components/ui/select", () => {
  const nothing = () => null;
  return { Select: nothing, SelectContent: nothing, SelectItem: nothing, SelectTrigger: nothing, SelectValue: nothing };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const nothing = () => null;
  return { AlertDialog: nothing, AlertDialogAction: nothing, AlertDialogCancel: nothing, AlertDialogContent: nothing, AlertDialogDescription: nothing, AlertDialogFooter: nothing, AlertDialogHeader: nothing, AlertDialogTitle: nothing };
});
vi.mock("@/features/calendar/class-scope-dialog", () => ({ ClassScopeDialog: () => null }));
const calendar = vi.hoisted(() => ({ block: {} as Record<string, unknown>, edit: vi.fn() }));
vi.mock("@/features/calendar/hooks", () => ({
  useCalendarBlock: () => ({ data: calendar.block, isPending: false, isError: false }),
  useEditEvent: () => ({ mutateAsync: calendar.edit, isPending: false }),
  useRemoveEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import EventDetailScreen from "../../../app/event/[id]";

const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const blocker = { id: 5, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, blocksAutoInvitations: true, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };
const personal = { ...blocker, type: "personal", blocksAutoInvitations: false };

beforeEach(() => vi.clearAllMocks());

async function openEditor(block: Record<string, unknown>, answer: object = {}) {
  calendar.block = block;
  calendar.edit.mockResolvedValue({ ...block, ...answer });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const n = await renderNative(
    <QueryClientProvider client={client}>
      <EventDetailScreen />
    </QueryClientProvider>
  );
  await n.flush();
  await n.press("event-detail-edit");
  return n;
}

describe("a blocker edited from the calendar's block screen (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar says how many were marked", async () => {
    const n = await openEditor(blocker, { markedClasses: [wed], coveredClasses: [] });
    await n.press("event-detail-save");
    await n.flush();
    expect(toast.success).toHaveBeenCalledWith("availability.covered.marked:1"); // the count, and nothing is asked
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(calendar.edit).toHaveBeenCalledTimes(1);
  });

  it("[CALENDAR-STUDENT-BLOCKERS-28] a failed save says so and shows no count; a block with no marked classes shows only the ordinary save", async () => {
    let n = await openEditor(personal, {});
    await n.press("event-detail-save");
    await n.flush();
    expect(toast.success).toHaveBeenCalledWith("calendar.eventDetail.eventUpdated");
    expect(toast.success).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    n = await openEditor(blocker);
    calendar.edit.mockRejectedValue(new Error("network"));
    await n.press("event-detail-save");
    await n.flush();
    expect(toast.error).toHaveBeenCalledWith("calendar.eventDetail.failedUpdateEvent");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-32] a student's blocker form says classes in the period are marked, above the save button; a coach's block does not", async () => {
    let n = await openEditor(blocker);
    const json = JSON.stringify(n.root.toJSON());
    expect(json).toContain("availability.covered.notice");
    expect(json.indexOf("blocker-covered-notice")).toBeLessThan(json.indexOf('"event-detail-save"'));

    n = await openEditor(personal);
    expect(n.queryByTestId("blocker-covered-notice")).toBeNull();
  });
});
