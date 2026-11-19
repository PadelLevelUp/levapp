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
  return { ...(await orig<object>()), listBlockers: f.api.listBlockers, putSchedule: f.api.putSchedule, deleteSchedule: f.api.deleteSchedule };
});
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
});
