import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Linking } from "react-native";

import { externalUrlForPushData, routeForPushData } from "@/lib/push-routing";
import { offerPushTap } from "@/lib/push-tap-queue";

/**
 * Foreground notifications show a banner + list entry but play no sound and do
 * not touch the badge (the badge is driven from the unread count, PAD-147).
 * Registered once, on first import (from `app/_layout.tsx`).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const openedExternal = new Set<string>();

/**
 * Collects a tapped push notification — a live tap while the app runs
 * (`addNotificationResponseReceivedListener`) or the tap that LAUNCHED the app
 * (`getLastNotificationResponseAsync`) — and OFFERS its route to the tap queue.
 * It never navigates: on a cold start this runs before the root navigator
 * exists, and navigating then loops the root layout and loses the tap (B-166,
 * messaging.push-notifications rule 13). `PushTapRouter`, mounted under the
 * navigator and the auth provider, takes the tap once both are ready.
 * The queue dedupes by notification id across re-mounts, so a cold-start tap
 * that also reaches the live listener is handled once.
 */
export function usePushNotificationRouting(): void {
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      try {
        // PAD-532: an absolute https URL (the staff console) opens in the
        // browser; it never reaches the in-app tap queue. Deduped by
        // notification id so a cold-start tap seen by both paths opens once.
        const external = externalUrlForPushData(response.notification.request.content.data);
        if (external) {
          const id = response.notification.request.identifier;
          if (openedExternal.has(id)) return;
          openedExternal.add(id);
          Linking.openURL(external).catch((error) => {
            console.warn("[push] opening external url failed", error);
          });
          return;
        }
        // PAD-327: a string for the message shape, a route object for the
        // `path` shape; PAD-408: the message shape may target one message.
        const target = routeForPushData(response.notification.request.content.data);
        if (target) offerPushTap(response.notification.request.identifier, target);
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
  }, []);
}
