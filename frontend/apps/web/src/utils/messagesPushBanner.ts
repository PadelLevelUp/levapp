import type { PushSaveState } from "@/hooks/usePushNotifications";

/**
 * auth.push-subscription rule 12 (PAD-789): which push line the Messages page shows, from the
 * browser's state alone. One line at most; none while push cannot work here or the browser's
 * subscription has not been read yet (so a subscribed browser never flashes the enable prompt).
 * The iOS/Android counterpart is `notificationBanner` (messaging.push-notifications rule 17).
 */
export type MessagesPushBanner = "none" | "enable" | "inactive" | "blocked";

export type MessagesPushBannerInput = {
  ready: boolean;
  isSupported: boolean;
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  saveState: PushSaveState;
};

export function messagesPushBanner({ ready, isSupported, permission, isSubscribed, saveState }: MessagesPushBannerInput): MessagesPushBanner {
  if (!isSupported || !ready) return "none";
  if (permission === "denied") return "blocked";
  if (permission === "granted" && saveState === "failed") return "inactive";
  if (!isSubscribed && saveState !== "failed") return "enable";
  return "none";
}
