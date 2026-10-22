import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import type { PushRegistrar, PushStatus } from "./types";

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
 * Android notification channel id. Must match the backend's
 * `ANDROID_CHANNEL_ID` (padel_app/utils/expo_push.py) and app.json's
 * expo-notifications `defaultChannel` (PAD-307).
 */
export const ANDROID_CHANNEL_ID = "default";

/**
 * messaging.push-notifications rule 15 (PAD-744): the waits before each retry of a failed
 * registration. After the last one the status is `failed` and the next foreground tries again.
 */
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 10_000, 30_000];

/**
 * expo-notifications implementation. Every step is best-effort: missing
 * permissions, simulators, or network failures all resolve silently —
 * callers can fire-and-forget.
 */
export class ExpoPushRegistrar implements PushRegistrar {
  /** Cached so unregister() can send the same token without re-prompting. */
  private currentToken: string | null = null;
  private state: PushStatus = "unknown";
  private readonly listeners = new Set<(status: PushStatus) => void>();
  /** Bumped by unregister(): a retry or a rotation from an earlier session sees a stale value and stops. */
  private generation = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

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

  private setStatus(next: PushStatus): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  register(): Promise<void> {
    return this.attempt({ prompt: true });
  }

  registerIfPermitted(): Promise<void> {
    return this.attempt({ prompt: false });
  }

  private async attempt({ prompt }: { prompt: boolean }, retry = 0, generation = this.generation): Promise<void> {
    if (retry === 0) this.clearRetry();
    try {
      if (Platform.OS === "android") {
        // PAD-307 (messaging.push-notifications rule 11d): the channel the
        // backend names in every Expo message (`channelId: "default"`, also
        // app.json's expo-notifications `defaultChannel`). HIGH importance is
        // what makes a message a heads-up banner with sound; DEFAULT would only
        // land it in the shade. Created before the permission prompt so the
        // first notification already finds it. Android keeps whatever the user
        // later changes in system settings — this call never lowers it.
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: "Messages",
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      // On Android 13+ this is the runtime POST_NOTIFICATIONS prompt (the
      // manifest permission comes from expo-notifications' plugin); below 13,
      // and on a device that already answered, it resolves without UI. iOS:
      // the usual alert/badge/sound prompt. Rule 15: only `register()` prompts.
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted" && prompt) {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== "granted") {
        console.log("[push] notification permission not granted");
        this.setStatus("no-permission");
        return;
      }

      // Simulators/emulators cannot obtain push tokens, but they CAN hold
      // notification permission — and without it iOS drops every
      // `xcrun simctl push`, which is how the PAD-240 Maestro flow delivers
      // its probe. So the permission is asked for above on every platform;
      // only the token fetch and the registration are device-only.
      if (!Device.isDevice) {
        console.log("[push] skipping registration: not a physical device");
        this.setStatus("unsupported");
        return;
      }

      const token = await this.getDeviceToken();
      if (!token) {
        this.setStatus("unsupported");
        return;
      }
      await this.send(token, generation);
    } catch (error) {
      console.warn("[push] register failed", error);
      this.scheduleRetry(() => this.attempt({ prompt: false }, retry + 1, generation), retry, generation);
    }
  }

  /** Caches the token and posts it; throws on a failed POST so the caller can retry. */
  private async send(token: string, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    this.currentToken = token;
    await api.post(PUSH_TOKEN_ENDPOINT, {
      token,
      platform: Platform.OS,
    });
    if (generation !== this.generation) return;
    this.clearRetry();
    this.setStatus("registered");
  }

  /** Rule 15: retry with growing waits, never across a logout; `failed` once they are spent. */
  private scheduleRetry(run: () => Promise<void>, retry: number, generation: number): void {
    if (generation !== this.generation) return;
    const delay = RETRY_DELAYS_MS[retry];
    if (delay === undefined) {
      this.setStatus("failed");
      return;
    }
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void run();
    }, delay);
  }

  watchTokenRotation(): () => void {
    try {
      const subscription = Notifications.addPushTokenListener(({ data }) => {
        if (typeof data !== "string" || !data || data === this.currentToken) return;
        const generation = this.generation;
        const sendRotated = (retry: number): Promise<void> =>
          this.send(data, generation).catch((error) => {
            console.warn("[push] rotated token register failed", error);
            this.scheduleRetry(() => sendRotated(retry + 1), retry, generation);
          });
        void sendRotated(0);
      });
      return () => subscription.remove();
    } catch {
      // No native module (tests, Expo Go without push): nothing to listen to.
      return () => undefined;
    }
  }

  status(): PushStatus {
    return this.state;
  }

  onStatusChange(listener: (status: PushStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  cachedToken(): string | null {
    return this.currentToken;
  }

  async unregister(): Promise<void> {
    // Rule 15: a logout ends every retry and rotation of this session.
    this.generation += 1;
    this.clearRetry();
    this.setStatus("unknown");
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
