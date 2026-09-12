import { Platform } from "react-native";
import type { KeyboardAvoidingViewProps } from "react-native";

/**
 * The one keyboard-avoidance policy — mobile.android-runtime rule 2.
 *
 * `padding` on both platforms: the view shrinks by the keyboard's height. The
 * old `undefined` on Android relied on the window resizing (`adjustResize`),
 * which does not happen under `edgeToEdgeEnabled` — on the PAD-297 emulator the
 * keyboard covered the login screen's Sign In button (run 34637032903). If a
 * screen ever needs a different value, this function changes, not the ten
 * screens that call it.
 */
export function keyboardAvoidingBehavior(): KeyboardAvoidingViewProps["behavior"] {
  return Platform.OS === "ios" || Platform.OS === "android" ? "padding" : undefined;
}
