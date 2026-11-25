/**
 * messaging.push-notifications rule 18 (PAD-789 item 3; admin.engine-health rule 8e): tell the
 * server when this phone's notification permission is refused, as a state. Started from
 * `AuthContext` once the signed-in user is known (the registrar knows no user), and reads the
 * permission at start and on every return to the foreground, whatever the registrar's status, so
 * a refusal made in Settings is seen.
 *
 * Reports when the permission changes into denied since the last state reported for this user on
 * this device, and again after PUSH_REFUSAL_RESEND_DAYS while still denied. The memory is written
 * only after the post succeeds; a failed post is dropped and sent again at the next start, never
 * on each read. A simulator (`Device.isDevice` false) reports nothing. Closed fields only.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { api } from "@/lib/api";

import { buildLabel } from "./failureReport";

export const REFUSAL_ENDPOINT = "/notifications/registration-failure";
/** const:PUSH_REFUSAL_RESEND_DAYS (specflow/impl/constants.md). */
export const PUSH_REFUSAL_RESEND_DAYS = 3;
const DAY_MS = 86_400_000;

type AppStateSubscribe = (listener: (status: AppStateStatus) => void) => { remove(): void };
const subscribeToAppState: AppStateSubscribe = (listener) => AppState.addEventListener("change", listener);

const memoryKey = (userId: number) => `push-refusal-report.${userId}`;
/** Users with a post in flight, one that failed, or a memory that cannot be written: one per session. */
const heldThisSession = new Set<number>();

async function readMemory(userId: number): Promise<number | null | "unreadable"> {
  try {
    const raw = await SecureStore.getItemAsync(memoryKey(userId));
    const at = raw === null ? null : Number(raw);
    return at === null || Number.isNaN(at) ? null : at;
  } catch {
    return "unreadable";
  }
}

async function writeMemory(userId: number, at: number | null): Promise<boolean> {
  try {
    if (at === null) await SecureStore.deleteItemAsync(memoryKey(userId));
    else await SecureStore.setItemAsync(memoryKey(userId), String(at));
    return true;
  } catch {
    return false;
  }
}

async function check(userId: number): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!Device.isDevice) return; // a simulator reports nothing
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "denied") {
    if (!heldThisSession.has(userId)) await writeMemory(userId, null); // granted or not asked resets it
    return;
  }
  if (heldThisSession.has(userId)) return;
  const memory = await readMemory(userId);
  if (typeof memory === "number" && Date.now() - memory < PUSH_REFUSAL_RESEND_DAYS * DAY_MS) return;
  if (heldThisSession.has(userId)) return; // another read got here while the memory was read
  heldThisSession.add(userId);
  try {
    await api.post(REFUSAL_ENDPOINT, { platform: Platform.OS, phase: "refused", permission: "denied", build: buildLabel() });
  } catch {
    return; // dropped: a diagnostic, never retried before the next start
  }
  if (await writeMemory(userId, Date.now())) heldThisSession.delete(userId);
}

/** Starts reporting for this user; returns the function that stops it. */
export function startPushRefusalReport(userId: number, onAppState: AppStateSubscribe = subscribeToAppState): () => void {
  let stopped = false;
  const read = () => {
    if (!stopped) void check(userId).catch(() => undefined);
  };
  read();
  const subscription = onAppState((status) => {
    if (status === "active") read();
  });
  return () => {
    stopped = true;
    subscription.remove();
  };
}
