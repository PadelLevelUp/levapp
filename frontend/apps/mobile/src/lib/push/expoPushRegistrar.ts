import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import type { PushRegistrar } from "./types";

/**
 * Native device-token registration endpoint. The same path is used for both
 * register (POST) and unregister (DELETE), per the backend contract:
 *   POST   /notifications/device  { token, platform: "ios" | "android" }
 *   DELETE /notifications/device  { token }
 * `api`'s baseURL already includes the `/api` prefix, so paths here are
 * unprefixed — matching every other resource call in this codebase (e.g.
 * `/auth/me`, `/app/notify/config`).
 */
export const PUSH_TOKEN_ENDPOINT: string = "/notifications/device";

/**
 * expo-notifications implementation. Every step is best-effort: missing
 * permissions, simulators, or network failures all resolve silently —
 * callers can fire-and-forget.
 */
export class ExpoPushRegistrar implements PushRegistrar {
  /** Cached so unregister() can send the same token without re-prompting. */
  private currentToken: string | null = null;

  /** Fetches the Expo push token for this device, or null if unavailable. */
  private async getDeviceToken(): Promise<string | null> {
    if (!Device.isDevice) return null;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return token;
  }

  async register(): Promise<void> {
    try {
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

      // Simulators/emulators cannot obtain push tokens, but they CAN hold
      // notification permission — and without it iOS drops every
      // `xcrun simctl push`, which is how the PAD-240 Maestro flow delivers
      // its probe. So the permission is asked for above on every platform;
      // only the token fetch and the registration are device-only.
      if (!Device.isDevice) {
        console.log("[push] skipping registration: not a physical device");
        return;
      }

      const token = await this.getDeviceToken();
      if (!token) return;
      this.currentToken = token;

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
      let token = this.currentToken;

      if (!token) {
        // No cached token (e.g. app was killed and relaunched straight into
        // logout) — re-derive it without prompting for permission again.
        if (!Device.isDevice) return;
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") return;
        token = await this.getDeviceToken();
      }
      if (!token) return;

      await api.delete(PUSH_TOKEN_ENDPOINT, { data: { token } });
      this.currentToken = null;
    } catch (error) {
      console.warn("[push] unregister failed", error);
    }
  }
}
