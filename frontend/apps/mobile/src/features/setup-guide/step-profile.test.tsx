/**
 * PAD-839 (dashboard.student-setup-guide rules 3.5, 13, 14) on iOS: step 5 shows each linked
 * coach's level and side from `/auth/me` ("Por definir" when unset), offers "Lembrar treinador" only
 * for a coach the dashboard lists as incomplete, and stays pending until every coach completes.
 * Mounts the step screen over the real `useSetupGuide` (fixtures in
 * `src/test/setup-guide-fixtures.tsx`).
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

import { api, dashboardPayload, makeMe, mount, resetGuideFixtures, setUser, settle, textOf } from "@/test/setup-guide-fixtures";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => {
  await resetGuideFixtures();
});

describe("step 5, the profile (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-17] shows each coach's level and side, reminds, and stays pending until every coach completes", async () => {
    setUser(
      makeMe({
        coaches: [
          { id: 7, name: "A", level: "B2", side: "left" },
          { id: 8, name: "B", level: "C1", side: null },
        ],
      })
    );
    api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 8, coachName: "B", missing: ["side"] }]));
    const n = await mount(createElement(SetupGuideScreen, { step: "profile" }));

    // No "Saltar" on step 5.
    expect(n.queryByTestId("setup-step-skip")).toBeNull();

    // A: B2, left, no button.
    expect(textOf(n.byTestId("setup-profile-level-7"))).toContain("B2");
    expect(textOf(n.byTestId("setup-profile-side-7"))).toContain("setupGuide.profile.sides.left");
    expect(n.queryByTestId("setup-remind-7")).toBeNull();
    expect(n.queryByTestId("setup-reminded-7")).toBeNull();

    // B: C1, side unset, with the button.
    expect(textOf(n.byTestId("setup-profile-level-8"))).toContain("C1");
    expect(textOf(n.byTestId("setup-profile-side-8"))).toContain("setupGuide.profile.unset");
    expect(n.queryByTestId("setup-remind-8")).not.toBeNull();

    await n.press("setup-remind-8");
    await settle(n);
    expect(api.sendProfileReminder).toHaveBeenCalledTimes(1);
    expect(api.sendProfileReminder).toHaveBeenCalledWith(8);
    expect(n.queryByTestId("setup-remind-8")).toBeNull();
    expect(n.queryByTestId("setup-reminded-8")).not.toBeNull();

    // Still pending: B has not set the side, and the student can never mark it done.
    expect(n.queryByTestId("setup-profile-all-set")).toBeNull();
    expect(api.updateMe).not.toHaveBeenCalled();

    // Once B completes (no profile_incomplete block), the step is done.
    api.getDashboard.mockResolvedValue(dashboardPayload());
    const done = await mount(createElement(SetupGuideScreen, { step: "profile" }));
    expect(done.queryByTestId("setup-profile-all-set")).not.toBeNull();
    expect(done.queryByTestId("setup-remind-8")).toBeNull();
  });
});
