import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { WaitingListPlace } from "@levelup/api/src/resources/academyClasses";
import {
  invitationLostToAnother,
  lisbonNowMs,
  offersWaitingListJoin,
  type InviteWaitingListMetadata,
} from "@levelup/config";
import type { ClassWaitingListRow } from "@levelup/types";

import { queryKeys } from "./queryKeys";

/**
 * PAD-577 (notifications.invitations rule 15a, waiting-list rule 14): the invitation bubble's
 * waiting-list offer, one hook for web and iOS. The shell injects its API module (web mocks
 * `@/api/academyClasses`, iOS imports `@levelup/api` directly) and how it tells the student
 * about a failure; the hook owns the lists query, the local state after a join or leave, the
 * refusal and the busy flag.
 */

/** The join refusal codes with their own copy under `calendar.joinRequest.refusal.*`. */
export const JOIN_REFUSAL_CODES = ["class_closed", "not_visible", "ineligible", "has_spots", "already_enrolled"] as const;

/** The i18n key for a failed join: the refusal's own line when the code is known, else the generic one. */
export function joinRefusalMessageKey(error: unknown): string {
  const code = (error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code;
  return code && (JOIN_REFUSAL_CODES as readonly string[]).includes(code)
    ? `calendar.joinRequest.refusal.${code}`
    : "messages.joinWaitingListFailed";
}

export type InviteWaitingListApi = {
  list: () => Promise<ClassWaitingListRow[]>;
  join: (event: { model: string; originalId: number | string }) => Promise<WaitingListPlace>;
  leave: (lessonInstanceId: number) => Promise<WaitingListPlace>;
};

export type UseInviteWaitingListOptions = {
  metadata: InviteWaitingListMetadata | undefined;
  /** A received invitation (not the sender's own bubble). */
  received: boolean;
  api: InviteWaitingListApi;
  /** Shows the student a failure; receives the i18n key. */
  notify: (key: string) => void;
};

export function useInviteWaitingList({ metadata, received, api, notify }: UseInviteWaitingListOptions) {
  const lostToAnother = received && invitationLostToAnother(metadata);
  const instanceId = Number(metadata?.lessonInstanceId);
  const queryClient = useQueryClient();
  const lists = useQuery({
    queryKey: queryKeys.classWaitingList,
    queryFn: api.list,
    enabled: lostToAnother,
  });
  const [local, setLocal] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const onList =
    local ?? (lists.data ?? []).some((r) => r.lessonInstanceId === instanceId && r.status === "active");
  const onWaitingList = lostToAnother && onList;
  const offersJoin =
    lostToAnother &&
    !refused &&
    lists.data !== undefined &&
    offersWaitingListJoin(metadata, { nowWallMs: lisbonNowMs(), onWaitingList: onList });

  const join = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.join({ model: "LessonInstance", originalId: instanceId });
      setLocal(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.classWaitingList });
    } catch (e) {
      notify(joinRefusalMessageKey(e));
      setRefused(true);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.leave(instanceId);
      setLocal(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.classWaitingList });
    } catch {
      notify("common.somethingWentWrong");
    } finally {
      setBusy(false);
    }
  };

  return { lostToAnother, onWaitingList, offersJoin, busy, join, leave };
}
