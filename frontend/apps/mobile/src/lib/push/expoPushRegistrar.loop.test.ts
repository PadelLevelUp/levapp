/**
 * messaging.push-notifications rule 15 (PAD-741 follow-up, build 37): the token listener must not
 * re-register the device. The native module re-emits the push-token event on every
 * `getDevicePushTokenAsync()` (expo-notifications PushTokenModule.swift: registerForRemoteNotifications
 * → didRegister → onDevicePushToken) and rejects a superseded in-flight call with E_PROMISE_REPLACED.
 * The fake models both, so a listener that asks for a device token loops, and the retry it causes
 * delays the first POST.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoNotificationsFake as fake } from "./testing/expoNotificationsFake";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
vi.mock("expo-device", () => ({ isDevice: true }));

vi.mock("expo-notifications", () => fake.module);

import { ExpoPushRegistrar, PUSH_TOKEN_ENDPOINT } from "./expoPushRegistrar";

const posted = () => post.mock.calls.filter(([p]) => p === PUSH_TOKEN_ENDPOINT).map(([, b]) => (b as { token: string }).token);

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset().mockResolvedValue({});
  fake.reset();
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
    expect(fake.counters.nativeRegistrations).toBe(1);
    expect(fake.counters.events).toBeLessThanOrEqual(2);
    expect(registrar.status()).toBe("registered");
    stop();
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-7] the listener hands the event to Expo as the device token, and an unchanged raw token does nothing", async () => {
    const registrar = new ExpoPushRegistrar();
    await Promise.all([registrar.register(), vi.advanceTimersByTimeAsync(100)]);
    const stop = registrar.watchTokenRotation();
    fake.counters.expoCalls.length = 0;
    fake.emit("b".repeat(64));
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.counters.expoCalls).toEqual([{ projectId: "p", devicePushToken: { type: "ios", data: "b".repeat(64) } }]);
    const calls = fake.counters.nativeRegistrations;
    fake.emit("b".repeat(64)); // same raw token again
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.counters.expoCalls).toHaveLength(1);
    expect(fake.counters.nativeRegistrations).toBe(calls);
    expect(posted()).not.toContain("b".repeat(64));
    stop();
  });
});
