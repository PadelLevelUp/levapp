import { useHeaderHeight } from "@react-navigation/elements";

// Kept out of keyboard-avoiding.ts: @react-navigation/elements brings image assets with it, and
// the keyboard policy is imported by unit tests that should not load them.
/**
 * mobile.android-runtime rule 2 (PAD-487, B-265): the `keyboardVerticalOffset` a screen under a NATIVE
 * stack header passes to its KeyboardAvoidingView. React Native pads by the view's own frame,
 * which `onLayout` reports relative to its parent — under a native header that frame starts
 * the header's height below the top of the window, so without this offset the view shrinks too
 * little and the bottom of the form (a notes field, a Send button) stays under the keyboard.
 * Screens that draw their own header inside the view, or have none, pass nothing.
 */
export function useNativeHeaderKeyboardOffset(): number {
  return useHeaderHeight();
}
