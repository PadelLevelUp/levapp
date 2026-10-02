import { useHeaderHeight } from "@react-navigation/elements";
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

/**
 * mobile.keyboard rule (PAD-487, B-265): the `keyboardVerticalOffset` a screen under a NATIVE
 * stack header passes to its KeyboardAvoidingView. React Native pads by the view's own frame,
 * which `onLayout` reports relative to its parent — under a native header that frame starts
 * the header's height below the top of the window, so without this offset the view shrinks too
 * little and the bottom of the form (a notes field, a Send button) stays under the keyboard.
 * Screens that draw their own header inside the view, or have none, pass nothing.
 */
export function useNativeHeaderKeyboardOffset(): number {
  return useHeaderHeight();
}
