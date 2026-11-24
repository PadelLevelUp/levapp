/**
 * messaging.push-notifications rule 15 (PAD-741 follow-up, build 37): the foreground recovery
 * (`startPushRecovery`) against the same re-emitting native module as expoPushRegistrar.loop.test.ts.
 * A cold-start register racing an "active", and a POST that keeps failing, must both stay bounded:
 * the native registrations stop growing once registered, or once the foregrounds stop.
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
import { startPushRecovery } from "./recovery";

type AppStateStatus = "active" | "background" | "inactive";
/** A fake AppState subscription: `foreground()` is a return to the app. */
function fakeAppState() {
  let cb: ((s: AppStateStatus) => void) | null = null;
  return {
    subscribe: (l: (s: AppStateStatus) => void) => {
      cb = l;
      return { remove: () => (cb = null) };
    },
    foreground: () => cb?.("active"),
  };
}

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

describe("startPushRecovery against a native module that re-emits (PAD-741, build 37)", () => {
  it("[MESSAGING-PUSH-NOTIFICATIONS-7] a cold-start register racing an 'active' makes at most two native registrations, and later foregrounds add none", async () => {
    const registrar = new ExpoPushRegistrar();
    const app = fakeAppState();
    const stop = startPushRecovery(registrar, app.subscribe as never);
    void registrar.register();
    app.foreground(); // iOS reports "active" while the first registration is still in flight
    await vi.advanceTimersByTimeAsync(1_000);
    expect(registrar.status()).toBe("registered");
    const afterStart = native.deviceTokenCalls;
    expect(afterStart).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) {
      app.foreground();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(native.deviceTokenCalls).toBe(afterStart);
    // The race can post the same Expo token twice (each registration ends in its own POST); never more.
    const posts = post.mock.calls.filter(([p]) => p === PUSH_TOKEN_ENDPOINT);
    expect(posts.length).toBeLessThanOrEqual(2);
    expect(new Set(posts.map(([, b]) => (b as { token: string }).token))).toEqual(new Set(["ExponentPushToken[abc]"]));
    stop();
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-7] with every POST failing, three foregrounds leave a bounded count that stops growing", async () => {
    post.mockRejectedValue(new Error("offline"));
    const registrar = new ExpoPushRegistrar();
    const app = fakeAppState();
    const stop = startPushRecovery(registrar, app.subscribe as never);
    await Promise.all([registrar.register(), vi.advanceTimersByTimeAsync(1_000)]);
    for (let i = 0; i < 3; i++) {
      app.foreground();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    await vi.advanceTimersByTimeAsync(3_600_000); // every retry wait, an hour on
    const settled = native.deviceTokenCalls;
    expect(settled).toBeLessThan(30); // the loop cap is 30: a runaway is not "bounded"
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(native.deviceTokenCalls).toBe(settled);
    stop();
  });
});
