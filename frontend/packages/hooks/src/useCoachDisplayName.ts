import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { coachDisplayName } from "@levelup/config";
import * as playersApi from "@levelup/api/src/resources/players";
import type { CoachPlayer } from "@levelup/types";

import { queryKeys } from "./queryKeys";

/**
 * PAD-660 (`players.nickname` rules 3 and 8): the name a coach's view prints for a student.
 *
 * A coach's private nickname reaches the client only on the coach's OWN roster rows, so every
 * coach view that prints a name from a shared payload (class requests, waiting lists, the
 * approval card, evaluations, attendance lists) asks this resolver with the student's player id
 * and the payload's real name as the fallback. One roster query, shared by every caller through
 * its key. A student's view passes `enabled: false`: no roster request, the fallback always.
 */
export function useCoachDisplayName(options?: {
  enabled?: boolean;
  fetchRoster?: () => Promise<CoachPlayer[]>;
}) {
  const enabled = options?.enabled ?? true;
  const { data } = useQuery({
    queryKey: queryKeys.coachPlayers,
    queryFn: options?.fetchRoster ?? playersApi.getCoachPlayers,
    enabled,
    staleTime: 60_000,
  });
  return useCallback(
    (playerId: string | number | null | undefined, fallback: string | null | undefined) =>
      coachDisplayName(enabled ? data : undefined, playerId, fallback),
    [data, enabled]
  );
}
