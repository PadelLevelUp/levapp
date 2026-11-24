/**
 * Test-only fake of expo-notifications' push-token surface, shared by the push tests so each
 * models the native module the same way (PAD-741, build 37). What it copies, from expo-notifications
 * 0.32.17:
 *  - every native registration re-emits `onDevicePushToken`: iOS `PushTokenModule.swift`
 *    `getDevicePushTokenAsync` → `registerForRemoteNotifications` → `didRegister` (:40, :50-53);
 *    Android `PushTokenModule.kt` `getDevicePushTokenAsync` → `onNewToken(token)` (:49-65);
 *  - iOS holds one pending promise: a newer request rejects it with `E_PROMISE_REPLACED` (:25-31) and
 *    `didRegister` resolves whichever promise is pending. Android has no such guard: every call
 *    resolves on its own;
 *  - `getExpoPushTokenAsync(options)` uses `options.devicePushToken` when given and otherwise asks
 *    the native module for one (getExpoPushTokenAsync.ts), then makes one request to Expo: a "fetch".
 * Plain TypeScript (no vitest import) so a `vi.mock("expo-notifications", () => fake.module)` factory
 * can use it. Import it before the module under test.
 */

export type PushPlatform = "ios" | "android";
export type DeviceTokenEvent = { type: PushPlatform; data: string };
export type ExpoTokenOptions = { projectId?: string; devicePushToken?: DeviceTokenEvent };

export const DEFAULT_RAW_TOKEN = "a3f1".repeat(16);
export const DEFAULT_EXPO_TOKEN = "ExponentPushToken[abc]";

export function createExpoNotificationsFake() {
  const config = { platform: "ios" as PushPlatform, rawToken: DEFAULT_RAW_TOKEN, expoToken: DEFAULT_EXPO_TOKEN, latencyMs: 50, loopCap: 30 };
  /** Everything a test asserts on. `reset()` zeroes it. */
  const counters = {
    /** Native device-token requests: getDevicePushTokenAsync, or getExpoPushTokenAsync without a device token. */
    nativeRegistrations: 0,
    /** onDevicePushToken events emitted. */
    events: 0,
    /** Requests that reached Expo's servers: one per getExpoPushTokenAsync call. */
    expoFetches: 0,
    /** The options of every getExpoPushTokenAsync call, in order. */
    expoCalls: [] as (ExpoTokenOptions | undefined)[],
  };
  const listeners = new Set<(event: DeviceTokenEvent) => void>();
  let pending: { resolve: (t: DeviceTokenEvent) => void; reject: (e: Error) => void } | null = null;

  /** The native side sends the event (and, on iOS, settles the pending promise first). */
  function didRegister(data: string): void {
    const token: DeviceTokenEvent = { type: config.platform, data };
    pending?.resolve(token);
    pending = null;
    counters.events += 1;
    for (const l of [...listeners]) l(token);
  }

  /** Emit a token event as the OS would (a rotation, or a repeat). */
  const emit = (data: string = config.rawToken): void => didRegister(data);

  function getDevicePushTokenAsync(): Promise<DeviceTokenEvent> {
    counters.nativeRegistrations += 1;
    // A runaway loop must end the test with a failed assertion, not a timeout.
    if (counters.nativeRegistrations > config.loopCap) return Promise.reject(new Error("loop cap"));
    if (config.platform === "ios") {
      pending?.reject(Object.assign(new Error("A newer async call to getDevicePushTokenAsync() was started."), { code: "E_PROMISE_REPLACED" }));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        setTimeout(() => didRegister(config.rawToken), config.latencyMs);
      });
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ type: config.platform, data: config.rawToken });
        didRegister(config.rawToken);
      }, config.latencyMs);
    });
  }

  async function getExpoPushTokenAsync(options?: ExpoTokenOptions): Promise<{ type: "expo"; data: string }> {
    counters.expoCalls.push(options);
    if (!options?.devicePushToken) await getDevicePushTokenAsync();
    counters.expoFetches += 1;
    return { type: "expo", data: config.expoToken };
  }

  const module = {
    AndroidImportance: { HIGH: 4 },
    setNotificationChannelAsync: async () => undefined,
    getPermissionsAsync: async () => ({ status: "granted" }),
    requestPermissionsAsync: async () => ({ status: "granted" }),
    addPushTokenListener: (listener: (event: DeviceTokenEvent) => void) => {
      listeners.add(listener);
      return { remove: () => void listeners.delete(listener) };
    },
    getDevicePushTokenAsync,
    getExpoPushTokenAsync,
  };

  return {
    module,
    counters,
    config,
    emit,
    /** Expo calls that handed Expo a device token (what an event-driven fetch looks like). */
    eventFetches: () => counters.expoCalls.filter((o) => o?.devicePushToken).length,
    /** Expo calls that made Expo ask the native module for a device token. */
    ownFetches: () => counters.expoCalls.filter((o) => !o?.devicePushToken).length,
    reset(): void {
      Object.assign(config, { platform: "ios", rawToken: DEFAULT_RAW_TOKEN, expoToken: DEFAULT_EXPO_TOKEN, latencyMs: 50, loopCap: 30 });
      Object.assign(counters, { nativeRegistrations: 0, events: 0, expoFetches: 0, expoCalls: [] });
      listeners.clear();
      pending = null;
    },
  };
}

/** The one instance the push tests share; a test file resets it in `beforeEach`. */
export const expoNotificationsFake = createExpoNotificationsFake();
