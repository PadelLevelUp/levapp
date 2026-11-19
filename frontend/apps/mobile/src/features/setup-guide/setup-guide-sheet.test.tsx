/**
 * PAD-839 (dashboard.student-setup-guide rule 4) on iOS: every way of closing the first-login sheet
 * except "Não mostrar mais" sends ONE snooze. Mounts `SetupGuideOnDashboard` over the real
 * `useSetupGuide` (fixtures in `src/test/setup-guide-fixtures.tsx`). The sheet's native Modal is the
 * stub's host `Modal`; its `onRequestClose` (Android back, a system close) is called on it directly.
 */
import { createElement } from "react";
import { act } from "react-test-renderer";
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

import { api, dashboardPayload, makeMe, mount, nav, notifications, resetGuideFixtures, setUser, type Mounted } from "@/test/setup-guide-fixtures";
import { SetupGuideOnDashboard } from "./setup-guide-surfaces";

beforeEach(async () => {
  await resetGuideFixtures();
  // A student at 40% (steps 1 and 4 done), never snoozed: the sheet opens.
  notifications.permission = { status: "undetermined", canAskAgain: true };
  api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
  setUser(makeMe({ setupGuide: { alertsConfirmed: true } }));
});

/** The same student again, sheet not snoozed, on a fresh dashboard. */
async function fresh() {
  await act(async () => setUser(makeMe({ setupGuide: { alertsConfirmed: true } })));
  api.updateMe.mockClear();
}

const modal = (n: Mounted) => n.root.root.findAll((x) => (x.type as unknown) === "Modal")[0];

async function openSheet() {
  const n = await mount(createElement(SetupGuideOnDashboard));
  expect(n.queryByTestId("setup-guide-sheet")).not.toBeNull();
  return n;
}

describe("the first-login sheet (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-24] every close but hide snoozes", async () => {
    // "Agora não".
    let n = await openSheet();
    await n.press("setup-guide-later");
    expect(n.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenLastCalledWith({ setupGuideSnooze: true });
    expect(nav.push).not.toHaveBeenCalled();

    // "Começar": snoozes too, and opens the next pending step.
    await fresh();
    n = await openSheet();
    await n.press("setup-guide-start");
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenLastCalledWith({ setupGuideSnooze: true });
    expect(nav.push).toHaveBeenLastCalledWith("/setup-guide?step=device_push");

    // A tap on the backdrop.
    await fresh();
    n = await openSheet();
    await n.press("setup-guide-backdrop");
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenLastCalledWith({ setupGuideSnooze: true });

    // A system close (swipe / Android back): onRequestClose.
    await fresh();
    n = await openSheet();
    await act(async () => modal(n).props.onRequestClose());
    expect(n.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenLastCalledWith({ setupGuideSnooze: true });

    // "Não mostrar mais" hides, and does not snooze.
    await fresh();
    n = await openSheet();
    await n.press("setup-guide-hide");
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenLastCalledWith({ setupGuideHidden: true });
    expect(n.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(n.queryByTestId("setup-guide-card")).toBeNull();

    // "Ver os 5 passos" on the card opens the list and writes nothing.
    await fresh();
    n = await openSheet();
    await n.press("setup-guide-all");
    expect(nav.push).toHaveBeenLastCalledWith("/setup-guide");
    expect(api.updateMe).not.toHaveBeenCalled();
  });
});
