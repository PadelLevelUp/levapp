/**
 * Stand-in for the `react-native` package under vitest.
 *
 * vitest.config.ts aliases `react-native` to this file, so a module under test
 * imports these objects instead of the real ones. That keeps the RN jest preset
 * (and react-native's untranspiled Flow sources) out of the unit-test path.
 *
 * Only the surface the tested modules actually touch is implemented. Add to it as
 * tests need more — and keep the additions honest: the value of this stub is that
 * it behaves like the real API, not that it merely type-checks.
 *
 * The `__` helpers are test-only controls and have no real-RN counterpart.
 */

export type PlatformOS = "ios" | "android";

/** Mirrors RN's Platform. Assign `Platform.OS` in a test to switch platform. */
export const Platform: { OS: PlatformOS } = { OS: "ios" };

type KeyboardListener = (...args: unknown[]) => void;

const listeners = new Map<string, Set<KeyboardListener>>();

/**
 * Mirrors RN's Keyboard module. `remove()` genuinely unsubscribes, so a test can
 * assert that a hook cleaned up after itself rather than just that it called
 * something named `remove`.
 */
export const Keyboard = {
  addListener(event: string, callback: KeyboardListener) {
    let bucket = listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      listeners.set(event, bucket);
    }
    bucket.add(callback);
    return {
      remove() {
        listeners.get(event)?.delete(callback);
      },
    };
  },
};

/** Test-only: fire a keyboard event at everything currently subscribed to it. */
export function __emitKeyboardEvent(event: string, ...args: unknown[]): void {
  for (const callback of [...(listeners.get(event) ?? [])]) callback(...args);
}

/** Test-only: how many listeners are currently subscribed to `event`. */
export function __keyboardListenerCount(event: string): number {
  return listeners.get(event)?.size ?? 0;
}

/** Test-only: every event name that currently has at least one listener. */
export function __subscribedKeyboardEvents(): string[] {
  return [...listeners.entries()]
    .filter(([, bucket]) => bucket.size > 0)
    .map(([event]) => event)
    .sort();
}

/** Test-only: drop every listener and restore the default platform. */
export function __resetReactNativeMock(): void {
  listeners.clear();
  Platform.OS = "ios";
}

type BackListener = () => boolean | null | undefined;
const backListeners: BackListener[] = [];

/**
 * Mirrors RN's BackHandler: listeners run newest first and the first one that
 * returns true consumes the press. `remove()` genuinely unsubscribes.
 */
export const BackHandler = {
  addEventListener(_event: "hardwareBackPress", handler: BackListener) {
    backListeners.push(handler);
    return {
      remove() {
        const i = backListeners.indexOf(handler);
        if (i >= 0) backListeners.splice(i, 1);
      },
    };
  },
};

/** Test-only: press back; true when a listener consumed it. */
export function __emitHardwareBack(): boolean {
  for (const handler of [...backListeners].reverse()) if (handler()) return true;
  return false;
}
