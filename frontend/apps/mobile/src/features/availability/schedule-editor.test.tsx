/**
 * PAD-839 (dashboard.student-setup-guide rules 9, 10) on iOS: the schedule editor sheet, the twin of
 * web's `components/availability/ScheduleEditor.test.tsx`, with the same test ids. Each grid cell
 * carries its state as `accessibilityValue.text` (web's `data-cell`). The second test mounts step 3
 * over the real `useSetupGuide` / `useSaveSchedule` / `useDeleteSchedule` (fixtures in
 * `src/test/setup-guide-fixtures.tsx`) to open a saved schedule with "Editar".
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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

import { emptySchedule, scheduleToBlockerInputs, type Schedule } from "@levelup/config";
import { api, blockerRow, makeMe, mount, resetGuideFixtures, setUser, settle, type Mounted } from "@/test/setup-guide-fixtures";
import { SetupGuideScreen } from "@/features/setup-guide/SetupGuideScreen";
import { ScheduleEditor } from "./ScheduleEditor";

beforeEach(async () => {
  await resetGuideFixtures();
});

const tap = async (n: Mounted, ...ids: string[]) => {
  for (const id of ids) await n.press(id);
};
const cell = (n: Mounted, h: string) => n.byTestId(`schedule-hour-${h}`).props.accessibilityValue?.text;
const periodRows = (n: Mounted) =>
  n.root.root.findAll((x) => typeof x.type === "string" && /^schedule-period-\d+$/.test(String(x.props.testID ?? "")));

describe("ScheduleEditor (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-13] a :30 end renders the hour half filled", async () => {
    const onSave = vi.fn();
    const n = await mount(createElement(ScheduleEditor, { open: true, initial: emptySchedule(), editing: false, onSave, onClose: () => {} }));
    expect(n.byTestId("schedule-hint").props.accessibilityValue).toEqual({ text: "1" });
    await tap(n, "schedule-hour-09");
    expect(n.byTestId("schedule-hint").props.accessibilityValue).toEqual({ text: "2" });
    expect(cell(n, "09")).toBe("anchor");
    await tap(n, "schedule-hour-13");
    expect(n.byTestId("schedule-hint").props.accessibilityValue).toEqual({ text: "3" });
    expect(cell(n, "12")).toBe("busy");
    expect(cell(n, "13")).toBe("free_end");

    await tap(n, "schedule-period-0-end-plus");
    expect(cell(n, "13")).toBe("half");

    // The row saved ends at 13:30.
    await tap(n, "schedule-day-1", "schedule-save");
    expect(onSave).toHaveBeenCalledTimes(1);
    const rows = scheduleToBlockerInputs(onSave.mock.calls[0][0] as Schedule, { startDate: "2026-11-19", endDate: "2027-02-19" });
    expect(rows.map((r) => [r.startTime, r.endTime, r.recurrenceRule.daysOfWeek])).toEqual([["09:00", "13:30", [1]]]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-14] save is disabled until a day has a period, and Editar opens the schedule's rows only", async () => {
    // Save waits for a day and a period.
    const onSave = vi.fn();
    const first = await mount(createElement(ScheduleEditor, { open: true, initial: emptySchedule(), editing: false, onSave, onClose: () => {} }));
    const saveDisabled = () => first.byTestId("schedule-save").props.disabled;
    expect(saveDisabled()).toBe(true);
    expect(first.queryByTestId("schedule-delete")).toBeNull();
    await tap(first, "schedule-day-1");
    expect(saveDisabled()).toBe(true); // a day, no period
    await tap(first, "schedule-day-1", "schedule-hour-09", "schedule-hour-11");
    expect(saveDisabled()).toBe(true); // a period, no day
    await tap(first, "schedule-day-1");
    expect(saveDisabled()).toBe(false);

    // Editar opens the saved schedule's three rows, not the hand-made block.
    setUser(makeMe());
    const base = { title: "Trabalho", recurrenceEnd: "2099-12-31", scheduleId: "s1" as string | null };
    api.listBlockers.mockResolvedValue([
      blockerRow({ ...base, id: 1, startTime: "09:00", endTime: "11:00" }),
      blockerRow({ ...base, id: 2, startTime: "15:00", endTime: "17:00" }),
      blockerRow({ ...base, id: 3, startTime: "19:00", endTime: "21:00" }),
      // The hand-made block: no schedule, Saturday 12:00–13:00.
      blockerRow({ ...base, id: 9, title: "Médico", scheduleId: null, recurrenceRule: { frequency: "weekly", daysOfWeek: [6] }, startTime: "12:00", endTime: "13:00" }),
    ]);
    const step = await mount(createElement(SetupGuideScreen, { step: "unavailability" }));
    await step.press("setup-schedule-edit");
    expect(step.queryByTestId("schedule-editor")).not.toBeNull();
    expect(step.queryByTestId("schedule-delete")).not.toBeNull();
    expect(periodRows(step)).toHaveLength(3);
    expect(cell(step, "12")).not.toBe("busy");

    // Remove one period and save: the remaining rows under the same scheduleId.
    await tap(step, "schedule-period-2-remove", "schedule-save");
    await settle(step);
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
    const [id, body] = api.putSchedule.mock.calls[0] as unknown as [string, { blockers: { startTime: string; endTime: string }[] }];
    expect(id).toBe("s1");
    expect(body.blockers.map((b) => [b.startTime, b.endTime])).toEqual([
      ["09:00", "11:00"],
      ["15:00", "17:00"],
    ]);
    expect(step.queryByTestId("schedule-editor")).toBeNull();

    // Open it again and delete the schedule: one DELETE of that id; the hand-made block is untouched.
    await step.press("setup-schedule-edit");
    await tap(step, "schedule-delete");
    await settle(step);
    expect(api.deleteSchedule).toHaveBeenCalledTimes(1);
    expect(api.deleteSchedule).toHaveBeenCalledWith("s1");
    expect(api.putSchedule).toHaveBeenCalledTimes(1);

    // Cancel closes and writes nothing.
    await step.press("setup-schedule-create");
    await tap(step, "schedule-cancel");
    expect(step.queryByTestId("schedule-editor")).toBeNull();
    expect(api.putSchedule).toHaveBeenCalledTimes(1);
  });
});
