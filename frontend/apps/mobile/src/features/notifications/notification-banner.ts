/**
 * Which notification banner the conversation screen should show (PAD-168).
 *
 * Web's `MessagesPage.tsx` decides this inline from the Web Push subscription:
 *
 *   isSupported && !isSubscribed && permission !== "denied"  → "enable" prompt
 *   isSupported && permission === "denied"                   → "blocked" notice
 *
 * iOS had neither, so a student whose notifications are off got no prompt to
 * turn them back on. The inputs differ (expo-notifications reports a
 * permission status and whether the OS will still show a prompt, and there is
 * no separate "subscribed" concept on a device) but the three outcomes are the
 * same, and the mapping is worth pinning where a test can reach it.
 */

/** The subset of expo-notifications' permission response this decision needs. */
export type NotificationPermissionSnapshot = {
  /** expo-notifications `PermissionStatus`: granted | denied | undetermined. */
  status: string | null | undefined;
  /**
   * Whether the OS will still show its own permission dialog. iOS only ever
   * asks once, so a user who tapped "Don't Allow" has `canAskAgain: false` and
   * can only re-enable from Settings.
   */
  canAskAgain?: boolean;
};

export type NotificationBanner =
  /** Notifications are on (or we don't know yet) — show nothing. */
  | "none"
  /** Never asked, and the OS will still ask — offer an in-app prompt. */
  | "prompt"
  /** Refused, and only Settings can undo it — offer a deep link there. */
  | "blocked";

export function notificationBanner(
  snapshot: NotificationPermissionSnapshot | null | undefined
): NotificationBanner {
  if (!snapshot || !snapshot.status) return "none";
  if (snapshot.status === "granted") return "none";
  // `denied`, or an `undetermined` the OS refuses to ask about again (iOS
  // reports exactly that once the system dialog has been dismissed): the only
  // route back is the Settings app, so say so instead of showing a button that
  // would do nothing.
  if (snapshot.status === "denied" || snapshot.canAskAgain === false) {
    return "blocked";
  }
  return "prompt";
}
