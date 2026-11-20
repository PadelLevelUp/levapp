/**
 * messaging.push-notifications rule 15 (PAD-741 follow-up, build 37): the foreground recovery
 * (`startPushRecovery`) against the same re-emitting native module as expoPushRegistrar.loop.test.ts.
 * A cold-start register racing an "active", and a POST that keeps failing, must both stay bounded:
 * the native registrations stop growing once registered, or once the foregrounds stop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoNotificationsFake as fake } from "./testing/expoNotificationsFake";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
vi.mock("expo-device", () => ({ isDevice: true }));

vi.mock("expo-notifications", () => fake.module);

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
  fake.reset();
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
    const afterStart = fake.counters.nativeRegistrations;
    expect(afterStart).toBeLessThanOrEqual(2);
    for (let i = 0; i < 5; i++) {
      app.foreground();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(fake.counters.nativeRegistrations).toBe(afterStart);
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
    const settled = fake.counters.nativeRegistrations;
    expect(settled).toBeLessThan(30); // the loop cap is 30: a runaway is not "bounded"
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fake.counters.nativeRegistrations).toBe(settled);
    stop();
  });
});
