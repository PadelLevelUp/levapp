/**
 * messaging.push-notifications rule 18 (PAD-789 item 3): a refused notification permission is
 * reported once per change into denied, seen on every foreground, never from a simulator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.3.1", ios: { buildNumber: "33" }, android: { versionCode: 12 } } },
}));
const notifications = vi.hoisted(() => ({ permission: "undetermined" as string }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ status: notifications.permission })),
}));
const device = vi.hoisted(() => ({ isDevice: true }));
vi.mock("expo-device", () => device);
const secure = vi.hoisted(() => ({ map: new Map<string, string>(), readThrows: false }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (k: string) => {
    if (secure.readThrows) throw new Error("locked");
    return secure.map.get(k) ?? null;
  }),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    if (secure.readThrows) throw new Error("locked");
    secure.map.set(k, v);
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    secure.map.delete(k);
  }),
}));


import type * as RefusalReport from "./refusalReport";

let Platform: { OS: string };
let mod: typeof RefusalReport; // reloaded per test: the session memory is module state
const PUSH_REFUSAL_RESEND_DAYS = 3; // const:PUSH_REFUSAL_RESEND_DAYS
const REFUSAL_ENDPOINT = "/notifications/registration-failure";

const DAY = 86_400_000;
const reports = () => post.mock.calls.filter(([p]) => p === REFUSAL_ENDPOINT).map(([, body]) => body);

let foreground: Array<(status: string) => void>;
const onAppState = (l: (status: never) => void) => {
  foreground.push(l as (status: string) => void);
  return { remove: () => undefined };
};
const settle = () => vi.advanceTimersByTimeAsync(0);
const comeToForeground = async () => {
  foreground.forEach((l) => l("active"));
  await settle();
};
const start = (userId = 7) => mod.startPushRefusalReport(userId, onAppState as never);

beforeEach(async () => {
  vi.resetModules();
  ({ Platform } = await import("@/test/mocks/react-native"));
  mod = await import("./refusalReport");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-07-12T10:00:00Z"));
  foreground = [];
  post.mockReset().mockResolvedValue({});
  notifications.permission = "undetermined";
  device.isDevice = true;
  secure.map.clear();
  secure.readThrows = false;
  Platform.OS = "ios";
});

afterEach(() => {
  vi.useRealTimers();
  Platform.OS = "ios";
});

describe("startPushRefusalReport (rule 18)", () => {
  it("[MESSAGING-PUSH-NOTIFICATIONS-42] a refusal reports once per change into denied, is seen on every foreground and never comes from a simulator", async () => {
    start();
    await settle();
    expect(reports()).toHaveLength(0); // undetermined

    notifications.permission = "denied"; // refused in Settings by a student who was registered
    await comeToForeground();
    expect(reports()).toEqual([{ platform: "ios", phase: "refused", permission: "denied", build: "33" }]);

    await comeToForeground(); // still denied
    expect(reports()).toHaveLength(1);

    foreground = []; // a later launch: the memory survives
    start();
    await settle();
    expect(reports()).toHaveLength(1);

    notifications.permission = "granted";
    await comeToForeground();
    notifications.permission = "denied";
    await comeToForeground();
    expect(reports()).toHaveLength(2);

    vi.setSystemTime(Date.now() + PUSH_REFUSAL_RESEND_DAYS * DAY - 1000);
    await comeToForeground();
    expect(reports()).toHaveLength(2);
    vi.setSystemTime(Date.now() + 2000);
    await comeToForeground();
    expect(reports()).toHaveLength(3);
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-42] an Android phone reports with its platform and build", async () => {
    Platform.OS = "android";
    notifications.permission = "denied";
    start();
    await settle();
    expect(reports()).toEqual([{ platform: "android", phase: "refused", permission: "denied", build: "12" }]);
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-42] a simulator sends nothing, whatever the registrar reads", async () => {
    device.isDevice = false;
    notifications.permission = "denied";
    start();
    await settle();
    await comeToForeground();
    expect(reports()).toHaveLength(0);
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-42] a failed post writes no memory, is not repeated in the session and is sent at the next start", async () => {
    notifications.permission = "denied";
    post.mockRejectedValue(new Error("offline"));
    start();
    await settle();
    await comeToForeground();
    await comeToForeground();
    expect(reports()).toHaveLength(1);
    expect(secure.map.size).toBe(0);

    foreground = [];
    post.mockResolvedValue({});
    vi.resetModules();
    const fresh = await import("./refusalReport");
    fresh.startPushRefusalReport(7, onAppState as never);
    await settle();
    expect(reports()).toHaveLength(2);
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-42] a memory that cannot be read reports once per session, and two users on a phone each report", async () => {
    notifications.permission = "denied";
    secure.readThrows = true;
    start();
    await settle();
    await comeToForeground();
    expect(reports()).toHaveLength(1);

    secure.readThrows = false;
    start(8); // another account on the same phone
    await settle();
    expect(reports()).toHaveLength(2);
  });

  it("[ADMIN-ENGINE-HEALTH-39] the resend interval is the constant and shorter than the count window", () => {
    expect(mod.PUSH_REFUSAL_RESEND_DAYS).toBe(PUSH_REFUSAL_RESEND_DAYS);
    expect(mod.REFUSAL_ENDPOINT).toBe(REFUSAL_ENDPOINT);
    expect(mod.PUSH_REFUSAL_RESEND_DAYS).toBeLessThan(7); // const:MESSAGE_RECIPIENT_WINDOW_DAYS
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-42] a stopped reporter sends nothing", async () => {
    const stop = start();
    await settle();
    stop();
    notifications.permission = "denied";
    await comeToForeground();
    expect(reports()).toHaveLength(0);
  });
});
