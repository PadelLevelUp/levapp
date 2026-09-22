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

// ── Host primitives (PAD-393, B-156) ─────────────────────────────────────────
// Enough of RN's rendering surface for react-test-renderer to mount a component:
// each primitive renders a host element of its own name and forwards its props, so
// `testID`, `onPress`, `onChangeText` and `accessibilityState` can be found and
// driven from a test. Layout, style and className are accepted and ignored.
import { createElement, forwardRef, type ReactNode } from "react";

type AnyProps = Record<string, unknown> & { children?: ReactNode };

function host(name: string) {
  const C = forwardRef<unknown, AnyProps>(function Host(props, ref) {
    return createElement(name, { ...props, ref });
  });
  C.displayName = name;
  return C;
}

export const View = host("View");
export const Text = host("Text");
export const ScrollView = host("ScrollView");
export const TextInput = host("TextInput");
export const Pressable = host("Pressable");
export const TouchableOpacity = host("TouchableOpacity");
export const ActivityIndicator = host("ActivityIndicator");
export const Switch = host("Switch");
export const Modal = host("Modal");
export const Image = host("Image");
export const StyleSheet = { create: (s: unknown) => s, flatten: (s: unknown) => s, hairlineWidth: 1 };
export const Dimensions = { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) };
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });
export const useColorScheme = () => "light" as const;
export const Animated = { View: host("Animated.View"), Text: host("Animated.Text"), Value: class { constructor(public v: number) {} }, timing: () => ({ start: (cb?: () => void) => cb?.() }) };

