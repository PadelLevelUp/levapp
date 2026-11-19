/**
 * PAD-839 (dashboard.student-setup-guide rules 3a, 4, 5) on iOS: the dashboard's guide card, the
 * "Conta pronta" card, and the step screen's skip and leave. Mounts `SetupGuideOnDashboard` and
 * `SetupGuideScreen` over the REAL `useSetupGuide` (real `@levelup/hooks` in a fresh query client)
 * with the API resource modules, `@/auth/AuthContext`, expo-notifications and the push registrar
 * mocked (fixtures in `src/test/setup-guide-fixtures.tsx`). Assertions are on test ids, values and
 * calls; `t` returns the key.
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

import { api, blockerRow, dashboardPayload, makeMe, mount, nav, notifications, resetGuideFixtures, setUser, settle, textOf } from "@/test/setup-guide-fixtures";
import { SetupGuideOnDashboard } from "./setup-guide-surfaces";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => { await resetGuideFixtures(); });

/** Steps 1–5 all done: confirmed alerts, granted push, a current block, a coach, a complete profile. */
function allDone(over: Parameters<typeof makeMe>[0] = {}) {
  notifications.permission = { status: "granted" };
  api.listBlockers.mockResolvedValue([blockerRow()]);
  api.getDashboard.mockResolvedValue(dashboardPayload());
  setUser(makeMe({ ...over, setupGuide: { alertsConfirmed: true, ...over.setupGuide } }));
}

describe("the setup guide card (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-6] opens the next pending step and skip and leave write nothing", async () => {
    // Steps 1 and 4 done, the sheet snoozed today: 2 of 5, next is step 2.
    notifications.permission = { status: "undetermined", canAskAgain: true };
    api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
    setUser(makeMe({ setupGuide: { alertsConfirmed: true, snoozedAt: new Date().toISOString() } }));

    const dash = await mount(createElement(SetupGuideOnDashboard));
    expect(dash.queryByTestId("setup-guide-sheet")).toBeNull();
    const card = dash.byTestId("setup-guide-card");
    expect(card.props.accessibilityValue).toMatchObject({ text: "ready", now: 40 });
    expect(textOf(dash.byTestId("setup-guide-percent"))).toBe("40%");
    expect(dash.byTestId("setup-guide-bar-device_push").props.accessibilityValue).toEqual({ text: "pending" });

    await dash.press("setup-guide-card");
    expect(nav.push).toHaveBeenLastCalledWith("/setup-guide?step=device_push");
    await dash.press("setup-guide-continue");
    expect(nav.push).toHaveBeenLastCalledWith("/setup-guide?step=device_push");
    await dash.press("setup-guide-all");
    expect(nav.push).toHaveBeenLastCalledWith("/setup-guide");

    // "Saltar" on step 2 opens step 3 and writes nothing.
    const step2 = await mount(createElement(SetupGuideScreen, { step: "device_push" }));
    expect(step2.queryByTestId("setup-step-device_push")).not.toBeNull();
    await step2.press("setup-step-skip");
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=unavailability");

    // "Agora não" on step 3 returns to the dashboard and writes nothing.
    const step3 = await mount(createElement(SetupGuideScreen, { step: "unavailability" }));
    await step3.press("setup-step-later");
    expect(nav.back).toHaveBeenCalledTimes(1);

    expect(api.updateMe).not.toHaveBeenCalled();
    expect(api.putSchedule).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    // The card still reads 2 of 5.
    const again = await mount(createElement(SetupGuideOnDashboard));
    expect(again.byTestId("setup-guide-card").props.accessibilityValue).toMatchObject({ now: 40 });
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-18] the ready card shows until closed", async () => {
    allDone();
    const first = await mount(createElement(SetupGuideOnDashboard));
    expect(first.queryByTestId("setup-guide-ready")).not.toBeNull();
    expect(first.queryByTestId("setup-guide-card")).toBeNull();
    expect(first.queryByTestId("setup-guide-sheet")).toBeNull();

    // A reload shows it again: it is not a one-render card.
    const reload = await mount(createElement(SetupGuideOnDashboard));
    expect(reload.queryByTestId("setup-guide-ready")).not.toBeNull();

    await reload.press("setup-guide-ready-close");
    await settle(reload);
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(api.updateMe).toHaveBeenCalledWith({ setupGuideReadyClosed: true });
    expect(reload.queryByTestId("setup-guide-ready")).toBeNull();
    expect(reload.queryByTestId("setup-guide-card")).toBeNull();

    // Closed on the account: another mount (a second device) shows no guide surface.
    const other = await mount(createElement(SetupGuideOnDashboard));
    expect(other.queryByTestId("setup-guide-ready")).toBeNull();
    expect(other.queryByTestId("setup-guide-card")).toBeNull();
    expect(other.queryByTestId("setup-guide-sheet")).toBeNull();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-20] a coach never sees the guide", async () => {
    setUser(makeMe({ roles: ["coach"], coaches: [] }));
    const n = await mount(createElement(SetupGuideOnDashboard));
    expect(n.queryByTestId("setup-guide-card")).toBeNull();
    expect(n.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(n.queryByTestId("setup-guide-ready")).toBeNull();
    // The guide never even reads its sources for a coach.
    expect(api.listBlockers).not.toHaveBeenCalled();
    expect(api.getDashboard).not.toHaveBeenCalled();
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-22] no ready card while the dashboard is loading", async () => {
    // Steps 1–4 done; the dashboard payload (step 5's source) never answers.
    allDone();
    api.getDashboard.mockImplementation(() => new Promise(() => undefined));
    const loading = await mount(createElement(SetupGuideOnDashboard));
    expect(loading.queryByTestId("setup-guide-ready")).toBeNull();
    expect(loading.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(loading.byTestId("setup-guide-card").props.accessibilityValue).toEqual({ text: "loading" });
    expect(loading.queryByTestId("setup-guide-percent")).toBeNull();
    expect(loading.byTestId("setup-guide-bar-profile").props.accessibilityValue).toEqual({ text: "unknown" });

    // The dashboard request failed: still unknown, still no ready card.
    api.getDashboard.mockRejectedValue(new Error("500"));
    const failed = await mount(createElement(SetupGuideOnDashboard));
    expect(failed.queryByTestId("setup-guide-ready")).toBeNull();
    expect(failed.byTestId("setup-guide-card").props.accessibilityValue).toEqual({ text: "loading" });

    // The blockers list still loading keeps step 3 unknown.
    api.getDashboard.mockResolvedValue(dashboardPayload());
    api.listBlockers.mockImplementation(() => new Promise(() => undefined));
    const blockers = await mount(createElement(SetupGuideOnDashboard));
    expect(blockers.queryByTestId("setup-guide-ready")).toBeNull();
    expect(blockers.byTestId("setup-guide-bar-unavailability").props.accessibilityValue).toEqual({ text: "unknown" });

    // Once every source answers, the real state shows.
    api.listBlockers.mockResolvedValue([blockerRow()]);
    const ready = await mount(createElement(SetupGuideOnDashboard));
    expect(ready.queryByTestId("setup-guide-ready")).not.toBeNull();
  });
});
