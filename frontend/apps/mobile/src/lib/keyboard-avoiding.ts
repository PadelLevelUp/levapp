import { Platform } from "react-native";
import type { KeyboardAvoidingViewProps } from "react-native";

/**
 * The one keyboard-avoidance policy — mobile.android-runtime rule 2.
 *
 * iOS: `padding` (the view shrinks by the keyboard's height). Android: nothing —
 * the window itself resizes for the keyboard (`adjustResize`, the prebuild
 * default with `edgeToEdgeEnabled`). If the emulator lane shows Android needs
 * `height` or `padding` under edge-to-edge, this function changes, not the ten
 * screens that call it.
 */
export function keyboardAvoidingBehavior(): KeyboardAvoidingViewProps["behavior"] {
  return Platform.OS === "ios" ? "padding" : undefined;
}
