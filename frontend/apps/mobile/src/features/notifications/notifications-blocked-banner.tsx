import * as Notifications from "expo-notifications";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking, Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import {
  notificationBanner,
  type NotificationBanner,
} from "./notification-banner";

/**
 * Live notification-permission state for the current device.
 *
 * Re-read whenever the app returns to the foreground: the "blocked" banner's
 * only cure is the Settings app, which means the user leaves and comes back,
 * and a banner still sitting there after they flipped the switch would be a
 * lie.
 */
function useNotificationBanner(): {
  banner: NotificationBanner;
  request: () => Promise<void>;
} {
  const [banner, setBanner] = React.useState<NotificationBanner>("none");

  const refresh = React.useCallback(() => {
    // Best-effort: on a simulator or when the module is unavailable this
    // rejects, and no banner is the right answer — never a crash on a screen
    // whose job is showing messages.
    Notifications.getPermissionsAsync()
      .then((permissions) => setBanner(notificationBanner(permissions)))
      .catch(() => setBanner("none"));
  }, []);

  React.useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const request = React.useCallback(async () => {
    try {
      const permissions = await Notifications.requestPermissionsAsync();
      setBanner(notificationBanner(permissions));
    } catch {
      // Leave the banner as it was; the user can try again.
    }
  }, []);

  return { banner, request };
}

/**
 * Mirrors web's two `MessagesPage.tsx` banners (PAD-168): an "enable
 * notifications" prompt while permission has never been asked for, and a
 * "notifications are blocked" notice once it has been refused.
 *
 * The difference from web is what "enable" does. Web calls `subscribe()` and
 * the browser prompts. iOS shows its permission dialog exactly once per
 * install, so after a refusal the only route back is Settings — the action
 * becomes `Linking.openSettings()`, and the copy says so.
 */
export function NotificationsBlockedBanner() {
  const { t } = useTranslation();
  const { banner, request } = useNotificationBanner();

  if (banner === "none") return null;

  const blocked = banner === "blocked";

  return (
    <View
      testID="notifications-banner"
      className="flex-row items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2"
    >
      <Text className="shrink text-xs text-muted-foreground">
        {blocked
          ? t("messages.notificationsBlockedDevice")
          : t("messages.enableNotificationsPrompt")}
      </Text>
      <Pressable
        testID="notifications-banner-enable"
        accessibilityLabel={t("messages.enable")}
        role="button"
        onPress={() => {
          if (blocked) void Linking.openSettings();
          else void request();
        }}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 active:opacity-60"
      >
        <Text className="text-xs font-medium text-foreground">
          {t("messages.enable")}
        </Text>
      </Pressable>
    </View>
  );
}
