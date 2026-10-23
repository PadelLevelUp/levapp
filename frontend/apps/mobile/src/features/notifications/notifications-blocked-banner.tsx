import * as Notifications from "expo-notifications";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking, Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { getPushRegistrar, type PushStatus } from "@/lib/push";
import {
  notificationBanner,
  type NotificationBanner,
  type NotificationPermissionSnapshot,
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
  retry: () => void;
} {
  const registrar = getPushRegistrar();
  const [permissions, setPermissions] = React.useState<NotificationPermissionSnapshot | null>(null);
  // messaging.push-notifications rule 15 (PAD-744): the registrar's state decides the third case.
  const [pushStatus, setPushStatus] = React.useState<PushStatus>(() => registrar.status());

  const refresh = React.useCallback(() => {
    // Best-effort: on a simulator or when the module is unavailable this
    // rejects, and no banner is the right answer — never a crash on a screen
    // whose job is showing messages.
    Notifications.getPermissionsAsync()
      .then(setPermissions)
      .catch(() => setPermissions(null));
  }, []);

  React.useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") refresh();
    });
    const stopStatus = registrar.onStatusChange(setPushStatus);
    return () => {
      subscription.remove();
      stopStatus();
    };
  }, [refresh, registrar]);

  const request = React.useCallback(async () => {
    try {
      const next = await Notifications.requestPermissionsAsync();
      setPermissions(next);
      // Rule 15: the grant registers the phone at once, without a second prompt.
      if (next.status === "granted") await registrar.registerIfPermitted();
    } catch {
      // Leave the banner as it was; the user can try again.
    }
  }, [registrar]);

  const retry = React.useCallback(() => {
    void registrar.registerIfPermitted();
  }, [registrar]);

  return { banner: notificationBanner(permissions, pushStatus), request, retry };
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
 *
 * A third case (PAD-744, rule 15): permission granted but the phone could not be registered, even
 * after retries. It says notifications are not active and its button registers again, so a failure
 * is never only a console line. Web's twin is `push-inactive-banner` (auth.push-subscription rule 9).
 */
export function NotificationsBlockedBanner() {
  const { t } = useTranslation();
  const { banner, request, retry } = useNotificationBanner();

  if (banner === "none") return null;

  const blocked = banner === "blocked";
  const inactive = banner === "inactive";

  return (
    <View
      testID="notifications-banner"
      className="flex-row items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2"
    >
      <Text className="shrink text-xs text-muted-foreground">
        {inactive
          ? t("messages.notificationsInactiveDevice")
          : blocked
            ? t("messages.notificationsBlockedDevice")
            : t("messages.enableNotificationsPrompt")}
      </Text>
      <Pressable
        testID={inactive ? "notifications-banner-retry" : "notifications-banner-enable"}
        accessibilityLabel={t("messages.enable")}
        role="button"
        onPress={() => {
          if (inactive) retry();
          else if (blocked) void Linking.openSettings();
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
