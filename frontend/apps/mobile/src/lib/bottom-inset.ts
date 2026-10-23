/**
 * mobile.android-runtime (PAD-730): who keeps content out from under the system navigation bar.
 *
 * With `edgeToEdgeEnabled` (app.json) Android draws the app under its navigation bar: 48 dp of
 * back/home/recent buttons with 3-button navigation, about 24 dp with gestures. iOS has only the
 * home indicator, which its screens already handle. So on Android:
 * - the root Stack pads every screen's content by the bottom inset (`rootContentBottomPadding`),
 *   except the tab navigator, whose bar takes the inset itself (`tabBarBottom`);
 * - a screen that used to add the inset itself must not add it again (`screenBottomInset`).
 * iOS keeps exactly what it had.
 *
 * Pure functions of the platform and the inset, so they are tested without a device.
 */
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type OS = typeof Platform.OS;

/** The tab bar's bottom padding and height. iOS: the 24/84 tuned for the home indicator. */
export function tabBarBottom(os: OS, insetBottom: number): { paddingBottom: number; height: number } {
  if (os !== "android") return { paddingBottom: 24, height: 84 };
  const paddingBottom = Math.max(insetBottom, 8);
  // 6 top padding + 54 for the icon and label, as on iOS (84 - 24 - 6), plus the inset.
  return { paddingBottom, height: 6 + 54 + paddingBottom };
}

/** The padding the root Stack puts under a screen's content (Android only), none while the
 * keyboard is up: the keyboard covers the navigation bar then, and a screen's
 * KeyboardAvoidingView lifts its form by the keyboard's overlap with ITS frame. With the padding
 * kept, that frame ends 48 dp higher, the lift is 48 dp smaller, and the login's password field
 * stayed under the keyboard (Play screenshot job, runs 40009341283 and 40015219350). */
export function rootContentBottomPadding(os: OS, insetBottom: number, keyboardVisible = false): number {
  return os === "android" && !keyboardVisible ? insetBottom : 0;
}

/** The bottom inset a screen adds itself: none on Android, where the root Stack already did. */
export function screenBottomInset(os: OS, insetBottom: number): number {
  return os === "android" ? 0 : insetBottom;
}

export function useScreenBottomInset(): number {
  return screenBottomInset(Platform.OS, useSafeAreaInsets().bottom);
}
