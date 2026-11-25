/**
 * messaging.push-notifications rule 15 (PAD-741, build 37): a push-token event costs at most one Expo
 * token fetch. Against the shared fake of expo-notifications (testing/expoNotificationsFake.ts), which
 * re-emits the event on every native registration on iOS and on Android alike, a listener that
 * fetches the Expo token without the event's device token starts a native registration per event, and
 * so one more event, and so one more fetch, until the app is killed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoNotificationsFake as fake, type PushPlatform } from "./testing/expoNotificationsFake";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-notifications", () => fake.module);

import { ExpoPushRegistrar } from "./expoPushRegistrar";
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

describe.each<PushPlatform>(["ios", "android"])("a push-token event costs at most one Expo token fetch (%s)", (platform) => {
  beforeEach(() => {
    fake.config.platform = platform;
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-37] a rotated token costs one fetch, a repeat of it none, and neither asks the native module for a token", async () => {
    const registrar = new ExpoPushRegistrar();
    await Promise.all([registrar.register(), vi.advanceTimersByTimeAsync(1_000)]);
    const stop = registrar.watchTokenRotation();
    const before = { fetches: fake.counters.expoFetches, native: fake.counters.nativeRegistrations };

    fake.emit("b".repeat(64)); // a rotation
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.counters.expoFetches - before.fetches).toBeLessThanOrEqual(1);

    fake.emit("b".repeat(64)); // the same raw token again
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fake.counters.expoFetches - before.fetches).toBeLessThanOrEqual(1);

    fake.emit("c".repeat(64)); // another rotation: one more fetch at most
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.counters.expoFetches - before.fetches).toBeLessThanOrEqual(2);
    expect(fake.counters.nativeRegistrations).toBe(before.native);
    stop();
  });

  it("[MESSAGING-PUSH-NOTIFICATIONS-37] a foreground that registers costs the registration's own fetch and one per event, and later foregrounds cost none", async () => {
    const registrar = new ExpoPushRegistrar();
    const app = fakeAppState();
    const stop = startPushRecovery(registrar, app.subscribe as never);
    app.foreground(); // not registered yet: registers without a prompt
    await vi.advanceTimersByTimeAsync(1_000);
    expect(registrar.status()).toBe("registered");
    // One native registration, so one event; the app's own fetch asked for the device token, the event's did not.
    expect(fake.counters.nativeRegistrations).toBe(1);
    expect(fake.ownFetches()).toBe(1);
    expect(fake.eventFetches()).toBeLessThanOrEqual(fake.counters.events);
    expect(fake.counters.expoFetches).toBeLessThanOrEqual(2);

    const settled = fake.counters.expoFetches;
    for (let i = 0; i < 5; i++) {
      app.foreground();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fake.counters.expoFetches).toBe(settled);
    stop();
  });
});
