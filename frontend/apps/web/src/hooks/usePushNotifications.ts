// Audit findings (Phase 1):
// - Messaging page uses SSE when the app is open, so push should complement closed-app cases.
// - There was no existing push subscription hook or service worker subscription flow.
// - JWT token is available from AuthContext and should be provided during subscribe/unsubscribe calls.
import { useCallback, useEffect, useMemo, useState } from "react";

import { subscribeToPush, unsubscribeFromPush } from "@/utils/pushNotifications";


type PushPermission = NotificationPermission | "unsupported";


export function usePushNotifications(token: string | null) {
  const isSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    []
  );

  const [permission, setPermission] = useState<PushPermission>(
    isSupported ? Notification.permission : "unsupported"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  const refreshSubscriptionState = useCallback(async () => {
    if (!isSupported) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setIsSubscribed(Boolean(subscription));
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
    void refreshSubscriptionState();
  }, [isSupported, refreshSubscriptionState]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !token) return false;

    let currentPermission = Notification.permission;
    if (currentPermission !== "granted") {
      currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
    }

    if (currentPermission !== "granted") return false;

    const subscribed = await subscribeToPush(token);
    setIsSubscribed(subscribed);
    return subscribed;
  }, [isSupported, token]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !token) return false;
    const unsubscribed = await unsubscribeFromPush(token);
    if (unsubscribed) {
      setIsSubscribed(false);
    }
    return unsubscribed;
  }, [isSupported, token]);

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
    unsubscribe,
  };
}
