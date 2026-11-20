/**
 * messaging.push-notifications rule 15 (PAD-741 follow-up, build 37): the token listener must not
 * re-register the device. The native module re-emits the push-token event on every
 * `getDevicePushTokenAsync()` (expo-notifications PushTokenModule.swift: registerForRemoteNotifications
 * → didRegister → onDevicePushToken) and rejects a superseded in-flight call with E_PROMISE_REPLACED.
 * The fake models both, so a listener that asks for a device token loops, and the retry it causes
 * delays the first POST.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
vi.mock("expo-device", () => ({ isDevice: true }));

const RAW = "a3f1".repeat(16);
const native = vi.hoisted(() => ({
  listener: null as null | ((e: { type: string; data: string }) => void),
  deviceTokenCalls: 0,
  events: 0,
  inFlight: null as null | { reject: (e: Error) => void },
  expoCalls: [] as unknown[],
  getDevice: (() => Promise.reject(new Error("unset"))) as () => Promise<unknown>,
}));
// The native call: starts a registration, a newer call rejects the one in flight, and the
// registration's answer is delivered as a token EVENT (as well as the promise).
native.getDevice = () => {
    native.deviceTokenCalls += 1;
    // A runaway loop must end the test with a failed assertion, not a timeout.
    if (native.deviceTokenCalls > 30) return Promise.reject(new Error("loop cap"));
    native.inFlight?.reject(Object.assign(new Error("replaced"), { code: "E_PROMISE_REPLACED" }));
    return new Promise<{ type: string; data: string }>((resolve, reject) => {
      native.inFlight = { reject };
      setTimeout(() => {
        native.inFlight = null;
        native.events += 1;
        native.listener?.({ type: "ios", data: RAW });
        resolve({ type: "ios", data: RAW });
      }, 50);
    });
  };


vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  addPushTokenListener: vi.fn((l: (e: { type: string; data: string }) => void) => {
    native.listener = l;
    return { remove: () => (native.listener = null) };
  }),
  // The native call: starts a registration, a newer call rejects the one in flight, and the
  // registration's answer is delivered as a token EVENT (as well as the promise).
  getDevicePushTokenAsync: vi.fn(() => native.getDevice()),
  // Expo's own: uses the device token it is given, otherwise asks the native module for one.
  getExpoPushTokenAsync: vi.fn(async (options?: { devicePushToken?: unknown }) => {
    native.expoCalls.push(options);
    if (!options?.devicePushToken) await native.getDevice();
    return { data: "ExponentPushToken[abc]" };
  }),
}));

import { ExpoPushRegistrar, PUSH_TOKEN_ENDPOINT } from "./expoPushRegistrar";

const posted = () => post.mock.calls.filter(([p]) => p === PUSH_TOKEN_ENDPOINT).map(([, b]) => (b as { token: string }).token);

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset().mockResolvedValue({});
  Object.assign(native, { listener: null, deviceTokenCalls: 0, events: 0, inFlight: null, expoCalls: [] });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("push-token listener against a native module that re-emits (PAD-741, build 37)", () => {
  it("[MESSAGING-PUSH-NOTIFICATIONS-7] registering posts once, with no retry, and the listener never asks for a device token", async () => {
    const registrar = new ExpoPushRegistrar();
    const stop = registrar.watchTokenRotation();
    const registered = registrar.register();
    await vi.advanceTimersByTimeAsync(60_000); // past every retry wait (2 s, 10 s, 30 s)
    await registered;
    expect(posted()).toEqual(["ExponentPushToken[abc]"]);
    // One native registration: register()'s own. Today's listener starts another on every event, forever.
    expect(native.deviceTokenCalls).toBe(1);
    expect(native.events).toBeLessThanOrEqual(2);
    expect(registrar.status()).toBe("registered");
    stop();
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-7] the listener hands the event to Expo as the device token, and an unchanged raw token does nothing", async () => {
    const registrar = new ExpoPushRegistrar();
    await Promise.all([registrar.register(), vi.advanceTimersByTimeAsync(100)]);
    const stop = registrar.watchTokenRotation();
    native.expoCalls.length = 0;
    native.listener?.({ type: "ios", data: "b".repeat(64) });
    await vi.advanceTimersByTimeAsync(10);
    expect(native.expoCalls).toEqual([{ projectId: "p", devicePushToken: { type: "ios", data: "b".repeat(64) } }]);
    const calls = native.deviceTokenCalls;
    native.listener?.({ type: "ios", data: "b".repeat(64) }); // same raw token again
    await vi.advanceTimersByTimeAsync(10);
    expect(native.expoCalls).toHaveLength(1);
    expect(native.deviceTokenCalls).toBe(calls);
    expect(posted()).not.toContain("b".repeat(64));
    stop();
  });
});
