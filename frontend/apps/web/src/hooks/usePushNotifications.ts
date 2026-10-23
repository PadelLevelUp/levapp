// Audit findings (Phase 1):
// - Messaging page uses SSE when the app is open, so push should complement closed-app cases.
// - There was no existing push subscription hook or service worker subscription flow.
// - JWT token is available from AuthContext and should be provided during subscribe/unsubscribe calls.
import { useCallback, useEffect, useMemo, useState } from "react";

import { savedThisSession, subscribeToPush, unsubscribeFromPush } from "@/utils/pushNotifications";


type PushPermission = NotificationPermission | "unsupported";

/** auth.push-subscription rule 9 (PAD-744): whether this session's save reached the server. */
export type PushSaveState = "idle" | "saved" | "failed";


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
  const [saveState, setSaveState] = useState<PushSaveState>("idle");

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

  // Never rejects (rule 9): a failed save is a state the page shows, not an unhandled rejection.
  const save = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const saved = await subscribeToPush(token);
      setSaveState(saved ? "saved" : "idle");
      setIsSubscribed(saved);
      return saved;
    } catch {
      setSaveState("failed");
      return false;
    }
  }, [token]);

  // Rule 9: on focus or visibility, a browser with permission granted saves its subscription once
  // per page session, subscribing first if it has none, without a prompt. That covers a
  // subscription the server dropped and one the browser rotated (the service worker has no JWT).
  useEffect(() => {
    if (!isSupported || !token) return;
    const resave = () => {
      if (document.visibilityState === "hidden") return;
      const current = Notification.permission;
      setPermission(current);
      if (current !== "granted" || savedThisSession(token)) return;
      void save();
    };
    resave();
    window.addEventListener("focus", resave);
    document.addEventListener("visibilitychange", resave);
    return () => {
      window.removeEventListener("focus", resave);
      document.removeEventListener("visibilitychange", resave);
    };
  }, [isSupported, token, save]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !token) return false;

    let currentPermission = Notification.permission;
    if (currentPermission !== "granted") {
      currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
    }

    if (currentPermission !== "granted") return false;

    return save();
  }, [isSupported, token, save]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !token) return false;
    const unsubscribed = await unsubscribeFromPush(token);
    if (unsubscribed) {
      setIsSubscribed(false);
      setSaveState("idle");
    }
    return unsubscribed;
  }, [isSupported, token]);

  return {
    isSupported,
    permission,
    isSubscribed,
    saveState,
    subscribe,
    unsubscribe,
  };
}
