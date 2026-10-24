/**
 * mobile.android-runtime rule 11 (PAD-730): who keeps content out from under the system navigation bar.
 *
 * With `edgeToEdgeEnabled` (app.json) Android draws the app under its navigation bar: 48 dp of
 * back/home/recent buttons with 3-button navigation, about 24 dp with gestures. iOS has only the
 * home indicator, which its screens already handle. So on Android:
 * - the root Stack pads every screen's content by the bottom inset (`rootContentBottomPadding`),
 *   except the tab navigator, whose bar takes the inset itself (`tabBarBottom`), and the screens
 *   that manage the keyboard (`KEYBOARD_SCREENS`), which keep their own bottom handling;
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

/** The padding the root Stack puts under a screen's content (Android only). */
export function rootContentBottomPadding(os: OS, insetBottom: number): number {
  return os === "android" ? insetBottom : 0;
}

/**
 * The root Stack's routes that manage the keyboard with a KeyboardAvoidingView. They keep their
 * own bottom handling and get no root padding: a padded frame changed how far the login form was
 * lifted, and the password field stayed under the keyboard (Play screenshot job, runs
 * 40009341283, 40015219350, 40018771651). `bottom-inset.test.ts` fails when a screen with a
 * KeyboardAvoidingView is missing here.
 */
export const KEYBOARD_SCREENS = [
  "login",
  "signup",
  "forgot-password",
  "verify-email",
  "class-request-wizard",
  "class/new",
  "event/new",
  "event/[id]",
  "conversation/new",
  "conversation/[id]",
] as const;

/** The bottom inset a screen adds itself: none on Android, where the root Stack already did. */
export function screenBottomInset(os: OS, insetBottom: number): number {
  return os === "android" ? 0 : insetBottom;
}

export function useScreenBottomInset(): number {
  return screenBottomInset(Platform.OS, useSafeAreaInsets().bottom);
}
