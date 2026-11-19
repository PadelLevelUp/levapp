/**
 * PAD-839 (dashboard.student-setup-guide rules 1, 3a, 4, 6): the web shell's student setup guide.
 * It reads what the app already fetches (the session's `/auth/me`, the blockers list, the
 * dashboard's `profile_incomplete` block, this browser's push permission) and hands it to the one
 * shared `setupGuideState`. Every guide write goes through `PATCH /api/auth/me` and then refreshes
 * the session (rule 6: `refreshUser`), so Settings and every surface read the new state.
 */
import { useCallback, useMemo } from "react";
import type { UpdateMePayload } from "@levelup/api/src/resources/auth";
import {
  deviceStepState,
  setupGuideState,
  type DeviceStepState,
  type SetupGuideView,
} from "@levelup/config";
import { useAvailabilityBlockers, useDashboard } from "@levelup/hooks";
import { useAuth } from "@/auth/AuthContext";
import { updateMe } from "@/api/auth";
import { useDashboardWindow } from "@/hooks/useDashboardWindow";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { isIosBrowserWithoutApp } from "@/utils/pushNotifications";

export interface SetupGuide {
  view: SetupGuideView;
  device: DeviceStepState | undefined;
  /** The dashboard's `profile_incomplete` coaches, for step 5. */
  incompleteCoaches: { coachId: number; coachName: string; missing: string[]; remindedToday: boolean; canRemind?: boolean }[];
  /** PATCH /api/auth/me with guide keys, then refresh the session. */
  write: (payload: UpdateMePayload) => Promise<void>;
  /**
   * Rule 7, web: subscribe through the same path as the Messages enable prompt. With the permission
   * denied the browser answers without a prompt, so this is also "Já mudei, verificar".
   */
  subscribe: () => Promise<boolean>;
}

/**
 * `always`: the guide's own screens read their sources even with the guide hidden or closed. The
 * dashboard and the ring read them only while the guide is open (rule 1's cost).
 */
export function useSetupGuide({ always = false }: { always?: boolean } = {}): SetupGuide {
  const { user, token, refreshUser } = useAuth();
  const student = user != null && !(user.roles ?? []).includes("coach");
  const open = always || (!user?.setupGuide?.hidden && !user?.setupGuide?.readyClosed);
  const blockers = useAvailabilityBlockers({ enabled: student && open });
  const dashboard = useDashboard(useDashboardWindow(), { enabled: student && open });
  const push = usePushNotifications(token);
  // Rule 3a / criterion 30: a 403 from the blockers list means no player row: not a student.
  const blockersForbidden =
    (blockers.error as { response?: { status?: number } } | null)?.response?.status === 403;

  // Rule 3a: step 2 is unknown until the browser's subscription has been read.
  const device = useMemo<DeviceStepState | undefined>(() => {
    if (isIosBrowserWithoutApp()) return deviceStepState("web_ios_browser", "unsupported");
    if (!push.ready) return undefined;
    return deviceStepState("web", push.permission, push.isSubscribed);
  }, [push.ready, push.permission, push.isSubscribed]);

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
    blockersForbidden,
  });

  const write = useCallback(
    async (payload: UpdateMePayload) => {
      await updateMe(payload);
      await refreshUser();
    },
    [refreshUser]
  );

  return {
    view,
    device,
    incompleteCoaches: profileBlock?.type === "profile_incomplete" ? profileBlock.data.coaches : [],
    write,
    subscribe: push.subscribe,
  };
}
