/**
 * PAD-839 (dashboard.student-setup-guide rules 3.1, 6) on iOS: step 1 sends the PATCH straight away
 * (no Settings save), writes the server's answer into the ["auth-me"] cache Settings reads
 * (`writeAuthMe`), refreshes the session (`refreshUser`) and opens step 2. Mounts the step screen
 * over the real `useSetupGuide` (fixtures in `src/test/setup-guide-fixtures.tsx`).
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

import { api, dashboardPayload, makeMe, mount, nav, refreshUser, resetGuideFixtures, setUser, settle } from "@/test/setup-guide-fixtures";
import { AUTH_ME_KEY } from "@/features/settings/write-auth-me";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => {
  await resetGuideFixtures();
  // At 20%: only the coach step is done (profile still waits on the coach).
  api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
});

describe("step 1, request alerts (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-3] turns request alerts on, writes the auth-me cache and refreshes the user", async () => {
    // The first student's alerts are ON by default and not confirmed; the second switched them off in Settings.
    for (const requestAlerts of [true, false]) {
      await resetGuideFixtures();
      api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
      setUser(makeMe({ requestAlerts }));
      const n = await mount(createElement(SetupGuideScreen, { step: "request_alerts" }));
      expect(n.queryByTestId("setup-step-request_alerts")).not.toBeNull();

      await n.press("setup-alerts-enable");
      await settle(n);

      expect(api.updateMe).toHaveBeenCalledTimes(1);
      expect(api.updateMe).toHaveBeenCalledWith({ requestAlerts: true, setupGuideAlertsConfirmed: true });
      const answer = await api.updateMe.mock.results[0].value;
      // Settings › Preferences reads ["auth-me"]: it holds the server's answer, no reload needed.
      expect(n.client.getQueryData(AUTH_ME_KEY)).toEqual(answer);
      expect(answer).toMatchObject({ requestAlerts: true, setupGuide: { alertsConfirmed: true } });
      expect(refreshUser).toHaveBeenCalledTimes(1);
      // Rule 5: on to step 2, the next pending step.
      expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=device_push");
    }
  });

  it("a failed PATCH stays on the step and says so", async () => {
    api.updateMe.mockRejectedValueOnce(new Error("500"));
    const n = await mount(createElement(SetupGuideScreen, { step: "request_alerts" }));
    await n.press("setup-alerts-enable");
    await settle(n);
    expect(n.queryByTestId("setup-alerts-failed")).not.toBeNull();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
