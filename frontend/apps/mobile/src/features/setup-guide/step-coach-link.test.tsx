/**
 * PAD-839 (dashboard.student-setup-guide rule 12) on iOS: step 4's "Ligar-me a um treinador" opens
 * the existing `connect` screen and writes nothing. Mounts the step screen over the real
 * `useSetupGuide` (fixtures in `src/test/setup-guide-fixtures.tsx`).
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

import { api, makeMe, mount, nav, resetGuideFixtures, setUser } from "@/test/setup-guide-fixtures";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => {
  await resetGuideFixtures();
});

describe("step 4, the coach link (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-25] opens the connect flow", async () => {
    setUser(makeMe({ coaches: [] }));
    const n = await mount(createElement(SetupGuideScreen, { step: "coach_link" }));
    expect(n.queryByTestId("setup-coach-linked")).toBeNull();

    await n.press("setup-connect");
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith("/connect");
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(api.putSchedule).not.toHaveBeenCalled();

    // "Faço isto depois" returns to the dashboard and writes nothing.
    await n.press("setup-step-later");
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(api.updateMe).not.toHaveBeenCalled();
  });
});
