/**
 * PAD-839 (dashboard.student-setup-guide rules 8, 10, 18) on iOS: step 3. "Estou sempre disponível"
 * and a preset each save and move on; a saved schedule shows its end, and "Prolongar" PUTs every row
 * with the new end. Mounts the step screen over the real `useSetupGuide` and the real
 * `useSaveSchedule` (fixtures in `src/test/setup-guide-fixtures.tsx`). `t` returns
 * `key|value…` so the end date can be read.
 */
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o ? `${key}|${Object.values(o).join("|")}` : key) }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", async () => ({ router: (await import("@/test/setup-guide-fixtures")).nav }));
vi.mock("expo-notifications", async () => (await import("@/test/setup-guide-fixtures")).notifications);
vi.mock("@/lib/push", async () => {
  const f = await import("@/test/setup-guide-fixtures");
  return { getPushRegistrar: () => f.registrar };
});
vi.mock("@/auth/AuthContext", async () => (await import("@/test/setup-guide-fixtures")).authModule);
vi.mock("@levelup/api/src/resources/auth", async (orig) => {
  const f = await import("@/test/setup-guide-fixtures");
  return { ...(await orig<object>()), updateMe: f.api.updateMe };
});
vi.mock("@levelup/api/src/resources/availability", async (orig) => {
  const f = await import("@/test/setup-guide-fixtures");
  return {
    ...(await orig<object>()),
    listBlockers: f.api.listBlockers, putSchedule: f.api.putSchedule, deleteSchedule: f.api.deleteSchedule,
    readScheduleCoveredClasses: f.api.readScheduleCoveredClasses, declineCoveredClasses: f.api.declineCoveredClasses,
  };
});
// The dialog primitives as plain views: shown while `open`, the buttons press their handlers.
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: unknown; testID?: string }) => createElement(View, { testID: p.testID }, p.children as never);
  const button = (p: { children?: unknown; testID?: string; onPress?: () => void }) =>
    createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children as never);
  return {
    AlertDialog: (p: { open: boolean; children?: unknown }) => (p.open ? createElement(View, null, p.children as never) : null),
    AlertDialogContent: box, AlertDialogHeader: box, AlertDialogFooter: box, AlertDialogTitle: box, AlertDialogDescription: box,
    AlertDialogCancel: button, AlertDialogAction: button,
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@levelup/api/src/resources/dashboard", async (orig) => {
  const f = await import("@/test/setup-guide-fixtures");
  return { ...(await orig<object>()), getDashboard: f.api.getDashboard, sendProfileReminder: f.api.sendProfileReminder };
});

import { api, blockerRow, makeMe, mount, nav, resetGuideFixtures, setUser, settle, textOf } from "@/test/setup-guide-fixtures";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => {
  await resetGuideFixtures();
  // No coach yet: after step 3 the next pending step is step 4.
  setUser(makeMe({ coaches: [] }));
});
afterEach(() => {
  vi.useRealTimers();
});

const openStep3 = () => mount(createElement(SetupGuideScreen, { step: "unavailability" }));

describe("step 3, unavailability (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-15] always available saves and moves on", async () => {
    const n = await openStep3();
    await n.press("setup-always-available");
    await settle(n);
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenCalledWith({ alwaysAvailable: true });
    expect(api.putSchedule).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=coach_link");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-16] a preset saves one schedule and moves on", async () => {
    const n = await openStep3();
    expect(n.byTestId("setup-unavailability-save").props.disabled).toBe(true);
    await n.press("setup-preset-work_weekdays");
    expect(n.queryByTestId("setup-schedule-preview")).not.toBeNull();
    expect(n.byTestId("setup-unavailability-save").props.disabled).toBe(false);

    await n.press("setup-unavailability-save");
    await settle(n);
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
    const [id, body] = api.putSchedule.mock.calls[0] as unknown as [string, { title: string; blockers: Record<string, unknown>[] }];
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.title).toBe("Trabalho");
    expect(body.blockers).toHaveLength(1);
    expect(body.blockers[0]).toMatchObject({
      title: "Trabalho",
      startTime: "09:00",
      endTime: "18:00",
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
    });
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=coach_link");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-31] a saved Varia schedule's card lists each day with its hours", async () => {
    // Criterion 11's rows: one schedule whose days differ, so it reopens in "Varia".
    api.listBlockers.mockResolvedValue([
      blockerRow({ id: 20, scheduleId: "v", startTime: "09:00", endTime: "11:00", recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3, 4, 5] }, recurrenceEnd: "2099-01-01" }),
      blockerRow({ id: 21, scheduleId: "v", startTime: "09:00", endTime: "20:00", recurrenceRule: { frequency: "weekly", daysOfWeek: [2] }, recurrenceEnd: "2099-01-01" }),
      blockerRow({ id: 22, scheduleId: "v", startTime: "15:00", endTime: "20:00", recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 4, 5] }, recurrenceEnd: "2099-01-01" }),
    ]);
    const n = await openStep3();
    const text = textOf(n.byTestId("setup-saved-schedule-text"));
    expect(text).toBe("seg 09–11 · 15–20; ter 09–20; qua 09–11; qui 09–11 · 15–20; sex 09–11 · 15–20");
    expect(text).not.toContain("setupGuide.editor.weekFree");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-28] shows the end and Prolongar extends every row", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
    const rowsA = [
      blockerRow({ id: 10, scheduleId: "a", title: "Trabalho", date: "2026-11-19", startTime: "09:00", endTime: "11:00", recurrenceEnd: "2027-02-19" }),
      blockerRow({ id: 11, scheduleId: "a", title: "Trabalho", date: "2026-11-19", startTime: "15:00", endTime: "20:00", recurrenceEnd: "2027-02-19" }),
    ];
    api.listBlockers.mockResolvedValue(rowsA);
    const n = await openStep3();
    expect(n.byTestId("setup-schedule-end").props.accessibilityValue).toEqual({ text: "ends" });
    expect(textOf(n.byTestId("setup-schedule-end"))).toBe("setupGuide.unavailability.ends|19/02/2027");

    await n.press("setup-schedule-extend");
    await settle(n);
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
    const [idA, bodyA] = api.putSchedule.mock.calls[0] as unknown as [string, { blockers: Record<string, unknown>[] }];
    expect(idA).toBe("a");
    expect(bodyA.blockers.map((b) => [b.startTime, b.endTime, b.endDate])).toEqual([
      ["09:00", "11:00", "2027-05-19"],
      ["15:00", "20:00", "2027-05-19"],
    ]);
    // The rows are otherwise unchanged.
    for (const b of bodyA.blockers) expect(b).toMatchObject({ title: "Trabalho", date: "2026-11-19", recurrenceRule: { daysOfWeek: [1, 2, 3, 4, 5] } });

    // A schedule that ended: "Terminou a", and Prolongar starts from today.
    api.putSchedule.mockClear();
    api.listBlockers.mockResolvedValue([
      blockerRow({ id: 5, scheduleId: "b", title: null, date: "2026-08-10", recurrenceEnd: "2026-11-10" }),
    ]);
    const ended = await openStep3();
    expect(ended.byTestId("setup-schedule-end").props.accessibilityValue).toEqual({ text: "ended" });
    expect(textOf(ended.byTestId("setup-schedule-end"))).toBe("setupGuide.unavailability.ended|10/11/2026");
    await ended.press("setup-schedule-extend");
    await settle(ended);
    const [idB, bodyB] = api.putSchedule.mock.calls[0] as unknown as [string, { blockers: Record<string, unknown>[] }];
    expect(idB).toBe("b");
    expect(bodyB.blockers.map((b) => b.endDate)).toEqual(["2027-02-19"]);
  });

  const covered = { model: "Lesson", originalId: 7, date: "2026-11-25", title: "Quarta", start: "2026-11-25T19:00:00", end: "2026-11-25T20:00:00" };

  it("[CALENDAR-STUDENT-BLOCKERS-26] a schedule over a class asks before moving on", async () => {
    api.readScheduleCoveredClasses.mockResolvedValue([covered]);
    const n = await openStep3();
    await n.press("setup-preset-work_weekdays");
    await n.press("setup-unavailability-save");
    await settle(n);
    // The read came first and named the id the PUT then used; the guide waits for the answer.
    expect(api.readScheduleCoveredClasses).toHaveBeenCalledTimes(1);
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
    expect(api.readScheduleCoveredClasses.mock.invocationCallOrder[0]).toBeLessThan(api.putSchedule.mock.invocationCallOrder[0]);
    expect((api.readScheduleCoveredClasses.mock.calls[0] as unknown[])[0]).toBe((api.putSchedule.mock.calls[0] as unknown[])[0]);
    expect(n.queryByTestId("blocker-covered-dialog")).not.toBeNull();
    expect(nav.replace).not.toHaveBeenCalledWith("/setup-guide?step=coach_link");
    await n.press("blocker-covered-keep");
    await settle(n);
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=coach_link");
    expect(api.declineCoveredClasses).not.toHaveBeenCalled();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-26] yes marks the listed class and the guide moves on after it", async () => {
    api.readScheduleCoveredClasses.mockResolvedValue([covered]);
    const n = await openStep3();
    await n.press("setup-preset-work_weekdays");
    await n.press("setup-unavailability-save");
    await settle(n);
    await n.press("blocker-covered-decline");
    await settle(n);
    expect(api.declineCoveredClasses).toHaveBeenCalledWith({ occurrences: [{ model: "Lesson", originalId: 7, date: "2026-11-25" }] });
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=coach_link");
  });

  it("[CALENDAR-STUDENT-BLOCKERS-26] a failed read saves the schedule and moves on without asking", async () => {
    api.readScheduleCoveredClasses.mockRejectedValue(new Error("network"));
    const n = await openStep3();
    await n.press("setup-preset-work_weekdays");
    await n.press("setup-unavailability-save");
    await settle(n);
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
    expect(n.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=coach_link");
  });
});
