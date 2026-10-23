/**
 * admin.engine-health rule 8d (PAD-746): tell the server when this phone's push registration
 * failed, so the failure shows on the engine health page instead of only in the device log.
 * Listens on PAD-744's `onRegistrationFailure` hook; sends closed fields only (no token, no
 * message text). Best effort: a report that fails is dropped and never retried.
 */
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/lib/api";

import type { PushFailure, PushRegistrar } from "./types";

export const REGISTRATION_FAILURE_ENDPOINT = "/notifications/registration-failure";
/** What the server accepts for `build` and `errorClass` (rule 8b). */
const IDENT = /^[A-Za-z0-9_.-]{1,60}$/;

type Permission = "granted" | "denied" | "undetermined" | "unknown";
type Post = (url: string, body: unknown) => Promise<unknown>;

/** The native build number (`ios.buildNumber` / `android.versionCode`), else the version. */
export function buildLabel(): string {
  const config = Constants.expoConfig;
  const build =
    Platform.OS === "android" ? config?.android?.versionCode?.toString() : config?.ios?.buildNumber;
  const label = build ?? config?.version ?? "unknown";
  return IDENT.test(label) ? label : "unknown";
}

async function permissionState(): Promise<Permission> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted" || status === "denied" || status === "undetermined" ? status : "unknown";
  } catch {
    return "unknown";
  }
}

export async function toReport(failure: PushFailure) {
  return {
    platform: Platform.OS,
    phase: failure.phase,
    permission: await permissionState(),
    build: buildLabel(),
    errorClass: IDENT.test(failure.errorClass) ? failure.errorClass : "unknown",
  };
}

/** Starts reporting the registrar's failures; returns the function that stops it. */
export function startPushFailureReport(
  registrar: PushRegistrar,
  post: Post = (url, body) => api.post(url, body),
): () => void {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return () => undefined;
  return registrar.onRegistrationFailure((failure) => {
    void (async () => {
      try {
        await post(REGISTRATION_FAILURE_ENDPOINT, await toReport(failure));
      } catch {
        // Dropped: the report is a diagnostic, never a reason to fail or retry anything.
      }
    })();
  });
}
