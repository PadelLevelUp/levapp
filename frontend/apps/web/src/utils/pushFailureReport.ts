/**
 * admin.engine-health rule 8d (PAD-746): tell the server when this browser's push save failed, so
 * the failure shows on the engine health page instead of only here. Listens on PAD-744's
 * `onPushSaveFailure` hook; sends closed fields only (no subscription, no message text).
 *
 * Best effort: a report that fails is dropped, never retried, and never signs the user out (it
 * uses `fetch`, not the API client, whose 401 handler redirects to the sign-in page).
 */
import { API_BASE_URL } from "@/api/base";
import { webTokenStorage } from "@/api/client";
import { onPushSaveFailure, type PushSaveFailure } from "@/utils/pushNotifications";

export const REGISTRATION_FAILURE_PATH = "/notifications/registration-failure";
/** What the server accepts for `build` and `errorClass` (rule 8b). */
const IDENT = /^[A-Za-z0-9_.-]{1,60}$/;

type Permission = "granted" | "denied" | "undetermined" | "unknown";

function permissionState(): Permission {
  if (typeof Notification === "undefined") return "unknown";
  if (Notification.permission === "default") return "undetermined";
  return Notification.permission;
}

export function toReport(failure: PushSaveFailure) {
  return {
    platform: "web",
    phase: failure.phase,
    permission: permissionState(),
    build: "web",
    errorClass: IDENT.test(failure.errorClass) ? failure.errorClass : "unknown",
  };
}

async function send(failure: PushSaveFailure): Promise<void> {
  try {
    const token = await webTokenStorage.getToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}${REGISTRATION_FAILURE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(toReport(failure)),
    });
  } catch {
    // Dropped: the report is a diagnostic, never a reason to fail or retry anything.
  }
}

/** Starts reporting; returns the function that stops it. */
export function startPushFailureReport(): () => void {
  return onPushSaveFailure((failure) => {
    void send(failure);
  });
}
