/**
 * dashboard.student-setup-guide rules 1, 3a (PAD-839): the web hook reads step 2 as unknown until
 * the browser's subscription is known, treats a 403 from the blockers list as "not a student", and
 * reads its sources only while the guide is open unless asked to always.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const state = vi.hoisted(() => ({
  user: null as unknown,
  push: { ready: true, permission: "granted", isSubscribed: true, subscribe: () => Promise.resolve(true) },
  blockers: { isSuccess: true, data: [], error: null as unknown },
  enabled: [] as unknown[],
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: state.user, token: "t", refreshUser: vi.fn() }) }));
vi.mock("@/api/auth", () => ({ updateMe: vi.fn() }));
vi.mock("@levelup/hooks", () => ({
  useAvailabilityBlockers: (o: { enabled?: boolean }) => {
    state.enabled.push(o?.enabled);
    return state.blockers;
  },
  useDashboard: () => ({ isSuccess: true, data: { blocks: [] } }),
}));
vi.mock("@/hooks/useDashboardWindow", () => ({ useDashboardWindow: () => ({ from: "a", to: "b" }) }));
vi.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: () => state.push }));
vi.mock("@/utils/pushNotifications", () => ({ isIosBrowserWithoutApp: () => false }));

import { useSetupGuide } from "./useSetupGuide";

const GUIDE = { snoozedAt: null, hidden: false, readyClosed: false, alwaysAvailable: false, alertsConfirmed: true };
const student = (guide: Partial<typeof GUIDE> = {}) => ({
  roles: ["player"], requestAlerts: true, coaches: [{ id: 1 }], setupGuide: { ...GUIDE, ...guide },
});

beforeEach(() => {
  state.user = student();
  state.push = { ready: true, permission: "granted", isSubscribed: true, subscribe: () => Promise.resolve(true) };
  state.blockers = { isSuccess: true, data: [], error: null };
  state.enabled = [];
});

describe("useSetupGuide (web)", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-22] step 2 is unknown until the subscription has been read", () => {
    state.push = { ...state.push, ready: false, isSubscribed: false };
    const before = renderHook(() => useSetupGuide()).result.current;
    expect(before.view.steps.device_push).toBe("unknown");
    expect(before.view.percent).toBeNull();
    state.push = { ...state.push, ready: true, isSubscribed: true };
    expect(renderHook(() => useSetupGuide()).result.current.view.steps.device_push).toBe("done");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-30] a 403 from the blockers list means not a student", () => {
    state.blockers = { isSuccess: false, data: undefined as never, error: { response: { status: 403 } } };
    const { view } = renderHook(() => useSetupGuide()).result.current;
    expect([view.student, view.showCard, view.showSheet, view.showRing]).toEqual([false, false, false, false]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-5] a hidden guide reads nothing on the dashboard, and its own screens still read", () => {
    state.user = student({ hidden: true });
    renderHook(() => useSetupGuide());
    renderHook(() => useSetupGuide({ always: true }));
    expect(state.enabled).toEqual([false, true]);
  });
});
