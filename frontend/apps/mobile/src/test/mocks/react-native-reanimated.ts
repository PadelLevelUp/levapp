/**
 * Stand-in for `react-native-reanimated` under vitest (PAD-393).
 *
 * The real package reaches `TurboModuleRegistry.get` at module load through
 * react-native-worklets, which the react-native stub does not (and should not) provide.
 * Skeleton and the dialog motion helpers import it, so any section that renders either
 * needs this alias. Animations do nothing here: `Animated.View` is a host element, the
 * hooks return their input, the timing helpers return it unchanged. Layout and motion are
 * the simulator's job, not this harness's.
 */
import { Animated } from "./react-native";

const identity = <T,>(v: T): T => v;

export default {
  View: Animated.View,
  Text: Animated.Text,
  createAnimatedComponent: <C,>(c: C): C => c,
};
export const useSharedValue = <T,>(v: T) => ({ value: v });
export const useAnimatedStyle = (fn: () => object) => fn();
export const useDerivedValue = <T,>(fn: () => T) => ({ value: fn() });
export const withTiming = identity;
export const withSpring = identity;
export const withRepeat = identity;
export const withSequence = identity;
export const withDelay = <T,>(_ms: number, v: T): T => v;
export const cancelAnimation = () => {};
export const runOnJS = <F,>(f: F): F => f;
export const Easing = { linear: identity, ease: identity, inOut: identity, out: identity, bezier: () => identity };
export const FadeIn = { duration: () => FadeIn };
export const FadeOut = { duration: () => FadeOut };
