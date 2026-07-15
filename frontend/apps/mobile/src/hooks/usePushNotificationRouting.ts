import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Foreground display policy: show a banner even while the app is open.
 * Module-level side effect — registered once, on first import (from
 * app/_layout.tsx), rather than inside the hook body, since it's global
 * app config rather than per-mount state.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type PushNotificationData = {
  type?: string;
  conversationId?: string;
  classInstanceId?: string;
};

/** Maps a notification's `data` payload to an in-app route, per the tap-routing contract. */
function routeForData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as PushNotificationData;

  if (payload.type === "message" && payload.conversationId) {
    return `/conversation/${payload.conversationId}`;
  }
  if (payload.type === "class" && payload.classInstanceId) {
    return `/class/${payload.classInstanceId}`;
  }
  return null;
}

/**
 * Wires push-notification tap → in-app navigation:
 * - Live taps while the app is running: `addNotificationResponseReceivedListener`.
 * - Cold start (app launched by tapping a notification): `getLastNotificationResponseAsync`
 *   on mount.
 *
 * Dedupe: both paths can fire for the same notification (a cold-start tap is
 * also delivered to the live listener once the app finishes mounting), so
 * each notification's `request.identifier` is tracked in a ref and only
 * navigated once.
 */
export function usePushNotificationRouting(): void {
  const router = useRouter();
  const handledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      try {
        const id = response.notification.request.identifier;
        if (handledIds.current.has(id)) return;
        handledIds.current.add(id);

        const path = routeForData(response.notification.request.content.data);
        if (path) router.push(path);
      } catch (error) {
        console.warn("[push] tap routing failed", error);
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch((error) => {
        console.warn("[push] getLastNotificationResponseAsync failed", error);
      });

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, [router]);
}
