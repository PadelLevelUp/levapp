/**
 * PAD-839 (dashboard.student-setup-guide rule 4) on iOS: the account avatar in the tabs header
 * carries the guide's ring, filled to the percent, for a student until 100 — never for a coach.
 * Mounts `SetupGuideAvatar` over the real `useSetupGuide` (fixtures in
 * `src/test/setup-guide-fixtures.tsx`); `react-native-svg` is a host stub. The header is shared by
 * every tab, so a source read of `app/(tabs)/_layout.tsx` pins that the avatar is wrapped there.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native-svg", async () => {
  const { createElement: h } = await import("react");
  const host = (name: string) => (p: Record<string, unknown>) => h(name, p);
  return { default: host("Svg"), Svg: host("Svg"), Circle: host("Circle") };
});
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

import { View } from "react-native";
import { api, blockerRow, dashboardPayload, makeMe, mount, notifications, resetGuideFixtures, setUser } from "@/test/setup-guide-fixtures";
import { SetupGuideAvatar } from "./setup-guide-ring";

const avatar = () => createElement(SetupGuideAvatar, null, createElement(View, { testID: "header-account" }));

beforeEach(async () => {
  await resetGuideFixtures();
});

describe("the avatar ring (iOS)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-7] the avatar ring shows the percent for a student until 100", async () => {
    // 60%: alerts confirmed, push granted, a coach; no block, the coach has not set the side.
    notifications.permission = { status: "granted" };
    api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
    setUser(makeMe({ setupGuide: { alertsConfirmed: true } }));
    const sixty = await mount(avatar());
    expect(sixty.byTestId("setup-guide-ring").props.accessibilityValue).toEqual({ min: 0, max: 100, now: 60 });
    expect(sixty.queryByTestId("header-account")).not.toBeNull();

    // 100%: no ring, the avatar alone.
    api.listBlockers.mockResolvedValue([blockerRow()]);
    api.getDashboard.mockResolvedValue(dashboardPayload());
    await act(async () => setUser(makeMe({ setupGuide: { alertsConfirmed: true } })));
    const full = await mount(avatar());
    expect(full.queryByTestId("setup-guide-ring")).toBeNull();
    expect(full.queryByTestId("header-account")).not.toBeNull();

    // A coach: never a ring, and the guide reads nothing.
    api.listBlockers.mockClear();
    api.getDashboard.mockClear();
    await act(async () => setUser(makeMe({ roles: ["coach"], coaches: [] })));
    const coach = await mount(avatar());
    expect(coach.queryByTestId("setup-guide-ring")).toBeNull();
    expect(coach.queryByTestId("header-account")).not.toBeNull();
    expect(api.listBlockers).not.toHaveBeenCalled();
    expect(api.getDashboard).not.toHaveBeenCalled();

    // The header avatar on every tab is the ringed one.
    const layout = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "app", "(tabs)", "_layout.tsx"),
      "utf8"
    );
    expect(layout).toMatch(/<SetupGuideAvatar>\s*<Pressable\s+testID="header-account"/);
    expect(layout).toMatch(/headerRight: \(\) => <AccountAvatar \/>/);
  });
});
