/**
 * PAD-839 (dashboard.student-setup-guide rule 7, OQ-C (a)) on iOS/Android: step 2 explains first,
 * and its button IS the Messages banner (`NotificationsBlockedBanner`). Opening the step never calls
 * `requestPermissionsAsync`; the banner's tap asks once (undetermined) and registers on a grant, or
 * opens the system settings (denied). Mounts the step screen over the real `useSetupGuide` and the
 * real banner; expo-notifications, the push registrar and `Linking` are mocked (fixtures in
 * `src/test/setup-guide-fixtures.tsx`).
 */
import { createElement } from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const linking = vi.hoisted(() => ({ openSettings: vi.fn(async () => undefined) }));
vi.mock("react-native", async (orig) => ({ ...(await orig<object>()), Linking: linking }));
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

import { Platform } from "react-native";
import { __emitAppState } from "@/test/mocks/react-native";
import { api, dashboardPayload, makeMe, mount, nav, notifications, registrar, resetGuideFixtures, setUser } from "@/test/setup-guide-fixtures";
import { SetupGuideScreen } from "./SetupGuideScreen";

beforeEach(async () => {
  await resetGuideFixtures();
  linking.openSettings.mockClear();
  // Step 1 and the coach done; step 3 pending, so step 2's next is step 3.
  api.getDashboard.mockResolvedValue(dashboardPayload([{ coachId: 7, coachName: "Ana", missing: ["side"] }]));
  setUser(makeMe({ setupGuide: { alertsConfirmed: true } }));
});

const openStep2 = () => mount(createElement(SetupGuideScreen, { step: "device_push" }));

describe("step 2, this phone's notifications", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-8] opening step 2 prompts nothing, and the button is the Messages banner", async () => {
    notifications.permission = { status: "undetermined", canAskAgain: true };
    const n = await openStep2();

    // Opening the step: the permission is read, never requested.
    expect(notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(n.byTestId("setup-device").props.accessibilityValue).toEqual({ text: "ask" });
    expect(n.queryByTestId("setup-device-how-to")).not.toBeNull();
    // The button is the banner's own.
    expect(n.queryByTestId("notifications-banner")).not.toBeNull();
    expect(n.queryByTestId("setup-device-allow")).toBeNull();

    // The banner's tap asks the system once and registers the phone on the grant.
    await n.press("notifications-banner-enable");
    await n.flush();
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(registrar.registerIfPermitted).toHaveBeenCalledTimes(1);
    expect(linking.openSettings).not.toHaveBeenCalled();

    // The system prompt sends the app inactive and back: the step reads the grant and moves on.
    await act(async () => __emitAppState("active"));
    await n.flush();
    expect(n.byTestId("setup-device").props.accessibilityValue).toEqual({ text: "done" });
    expect(nav.replace).toHaveBeenLastCalledWith("/setup-guide?step=unavailability");
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-23] denied shows the platform's path and opens the system settings", async () => {
    // iOS.
    notifications.permission = { status: "denied", canAskAgain: false };
    const ios = await openStep2();
    expect(ios.byTestId("setup-device").props.accessibilityValue).toEqual({ text: "open_settings" });
    expect(ios.queryByTestId("setup-device-path-ios")).not.toBeNull();
    expect(ios.queryByTestId("setup-device-path-android")).toBeNull();
    await ios.press("notifications-banner-enable");
    expect(linking.openSettings).toHaveBeenCalledTimes(1);
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    // Android: its own Settings path, the same button.
    Platform.OS = "android";
    linking.openSettings.mockClear();
    const android = await openStep2();
    expect(android.byTestId("setup-device").props.accessibilityValue).toEqual({ text: "open_settings" });
    expect(android.queryByTestId("setup-device-path-android")).not.toBeNull();
    expect(android.queryByTestId("setup-device-path-ios")).toBeNull();
    await android.press("notifications-banner-enable");
    expect(linking.openSettings).toHaveBeenCalledTimes(1);
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(api.updateMe).not.toHaveBeenCalled();
  });
});
