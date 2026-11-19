/**
 * PAD-839 (dashboard.student-setup-guide rules 1, 3a, 4, 6, 7): the iOS/Android shell's student
 * setup guide, the twin of web's `components/setup-guide/useSetupGuide.ts`. A blockers list that
 * answers 403 (no player row) makes the account no student for the guide (rule 3a).
 *
 * It reads what the app already fetches — the session's `/auth/me`, the blockers list, the
 * dashboard's `profile_incomplete` block (the SAME cache entry the dashboard screen reads, through
 * `useDashboardWindow`) and this device's push permission — and hands it to the one shared
 * `setupGuideState`. Nothing here re-derives a step.
 *
 * Every guide write is `PATCH /api/auth/me`, then (rule 6) the answer goes into the ["auth-me"]
 * cache Settings reads (`writeAuthMe`) and the session re-reads `/auth/me` (`refreshUser`).
 */
import { authApi } from "@levelup/api";
import type { UpdateMePayload } from "@levelup/api/src/resources/auth";
import {
  deviceStepState,
  setupGuideState,
  type DevicePermission,
  type DeviceStepState,
  type SetupGuideView,
} from "@levelup/config";
import { useAvailabilityBlockers, useDashboard } from "@levelup/hooks";
import type { DashboardProfileIncompleteBlock } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import * as React from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { useDashboardWindow } from "@/features/dashboard/use-dashboard-window";
import { writeAuthMe } from "@/features/settings/write-auth-me";

export type IncompleteCoach = DashboardProfileIncompleteBlock["data"]["coaches"][number];

export interface SetupGuide {
  view: SetupGuideView;
  /** Step 2's state on this device; `undefined` while the permission is being read (rule 3a). */
  device: DeviceStepState | undefined;
  /** The dashboard's `profile_incomplete` coaches, for step 5. */
  incompleteCoaches: IncompleteCoach[];
  /** PATCH /api/auth/me with guide keys, then update the ["auth-me"] cache and the session. */
  write: (payload: UpdateMePayload) => Promise<void>;
}

/**
 * expo-notifications' answer as the shared `DevicePermission`. An `undetermined` the OS will not
 * ask about again is `denied`: the Messages banner (the step's button, rule 7) treats it as blocked
 * and opens Settings, so the step's text says the same.
 */
export function devicePermissionOf(snapshot: { status?: string | null; canAskAgain?: boolean }): DevicePermission {
  if (snapshot.status === "granted") return "granted";
  if (snapshot.status === "denied" || snapshot.canAskAgain === false) return "denied";
  return "undetermined";
}

/**
 * This device's push permission, re-read whenever the app returns to the foreground (the cure for
 * "denied" is the Settings app, and the iOS prompt itself sends the app inactive and back).
 * `undefined` until the first read answers; a failed read stays `undefined` (rule 3a).
 */
function useDevicePermission(): DevicePermission | undefined {
  const [permission, setPermission] = React.useState<DevicePermission | undefined>(undefined);
  React.useEffect(() => {
    let alive = true;
    const read = () => {
      Notifications.getPermissionsAsync()
        .then((p) => {
          if (alive) setPermission(devicePermissionOf(p));
        })
        .catch(() => undefined);
    };
    read();
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") read();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return permission;
}

/** HTTP 403 from the blockers list: an account with no player row (rule 3a). */
function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 403;
}

/**
 * `always`: read the blockers list and the dashboard payload even while the guide is hidden or
 * ready-closed. Only the guide's own screen passes it (rule 1, cost); the dashboard's card and
 * sheet and the header avatar's ring read them only while the guide is open.
 */
export function useSetupGuide(options: { always?: boolean } = {}): SetupGuide {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const student = user != null && !(user.roles ?? []).includes("coach");
  const open = student && user?.setupGuide?.hidden !== true && user?.setupGuide?.readyClosed !== true;
  const reads = student && (options.always === true || open);
  const blockers = useAvailabilityBlockers({ enabled: reads });
  const dashboard = useDashboard(useDashboardWindow(), { enabled: reads });
  const permission = useDevicePermission();

  const device = React.useMemo<DeviceStepState | undefined>(
    () =>
      permission === undefined
        ? undefined
        : deviceStepState(Platform.OS === "android" ? "android" : "ios", permission),
    [permission]
  );

  const profileBlock = dashboard.data?.blocks.find((b) => b.type === "profile_incomplete");
  const view = setupGuideState({
    me: user ?? undefined,
    blockers: blockers.isSuccess ? blockers.data : undefined,
    profileIncomplete: dashboard.isSuccess
      ? profileBlock?.type === "profile_incomplete"
        ? profileBlock.data
        : null
      : undefined,
    device,
    blockersForbidden: blockers.isError && isForbidden(blockers.error),
  });

  const write = React.useCallback(
    async (payload: UpdateMePayload) => {
      const answer = await authApi.updateMe(payload);
      await writeAuthMe(queryClient, answer);
      await refreshUser();
    },
    [queryClient, refreshUser]
  );

  return {
    view,
    device,
    incompleteCoaches: profileBlock?.type === "profile_incomplete" ? profileBlock.data.coaches : [],
    write,
  };
}
