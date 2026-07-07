import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import type { PushRegistrar } from "./types";

/**
 * KNOWN BACKEND GAP: the backend has no endpoint for native (Expo/FCM/APNs)
 * push tokens yet. It only exposes Web-Push at `/api/notifications/subscribe`,
 * which expects a browser PushSubscription object — not an Expo push token.
 * When a native token endpoint lands (e.g. POST /notifications/push-tokens),
 * set its path here and registration will start syncing tokens automatically.
 */
export const PUSH_TOKEN_ENDPOINT: string | null = null;

/**
 * expo-notifications implementation. Every step is best-effort: missing
 * permissions, simulators, missing project config or the missing backend
 * endpoint all resolve silently — callers can fire-and-forget.
 */
export class ExpoPushRegistrar implements PushRegistrar {
  async register(): Promise<void> {
    try {
      if (!Device.isDevice) {
        // Simulators/emulators cannot obtain push tokens.
        console.log("[push] skipping registration: not a physical device");
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== "granted") {
        console.log("[push] notification permission not granted");
        return;
      }

      const projectId: string | undefined =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );

      if (!PUSH_TOKEN_ENDPOINT) {
        console.log(
          "[push] no backend endpoint for native push tokens yet; skipping sync",
          token
        );
        return;
      }

      await api.post(PUSH_TOKEN_ENDPOINT, {
        token,
        platform: Platform.OS,
      });
    } catch (error) {
      console.warn("[push] register failed", error);
    }
  }

  async unregister(): Promise<void> {
    try {
      if (!PUSH_TOKEN_ENDPOINT) return;
      await api.delete(PUSH_TOKEN_ENDPOINT);
    } catch (error) {
      console.warn("[push] unregister failed", error);
    }
  }
}
