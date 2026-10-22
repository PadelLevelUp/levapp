/**
 * Stand-in for `react-native-safe-area-context` under vitest (PAD-727).
 *
 * The real package's entry pulls react-native's Flow sources, which vitest does not transform
 * ("Unexpected token 'typeof'"). The shared SelectContent reads the insets since PAD-727, so
 * every section that renders a select needs this alias. A device with no system bars: all
 * insets are 0, the provider and SafeAreaView are pass-throughs. A test that cares about
 * insets mocks the module itself (dialog.test.tsx does).
 */
import { View } from "./react-native";

export type Edge = "top" | "right" | "bottom" | "left";
export type Edges = readonly Edge[];

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

export const useSafeAreaInsets = () => ZERO;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });
export const SafeAreaProvider = ({ children }: { children?: unknown }) => children;
export const SafeAreaView = View;
export const initialWindowMetrics = { insets: ZERO, frame: { x: 0, y: 0, width: 390, height: 844 } };
