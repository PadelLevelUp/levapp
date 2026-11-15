import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as playersApi from "@levelup/api/src/resources/players";
import * as presencesApi from "@levelup/api/src/resources/presences";
import * as presencesViewApi from "@levelup/api/src/resources/presencesView";
import type { CoachPresencesView } from "@levelup/types";
import { queryKeys } from "./queryKeys";
import type { QueryOverrides } from "./queries";

/**
 * Presences and roster reads for the web (client.query-cache rules 6-8, PAD-586). Same shapes and
 * the SAME key strings as the mobile feature hooks (`features/presences/hooks.ts`), so a presence
 * write invalidates alike in both apps.
 */

/** The coach's players, shared by calendar, presences and player detail (one key, one fetch). */
export function useCoachRoster(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.coachRoster,
    queryFn: () => playersApi.getCoachPlayers(),
    ...options,
  });
}

/** The tab's one period (attendance.validation rule 17g): bare inclusive `YYYY-MM-DD` bounds. */
export interface PresencePeriodBounds {
  from: string;
  to: string;
}

/** `period`: the tab's period, sent as `from`/`to`; `undefined` is the server's default window. */
export function usePresenceStats(period?: PresencePeriodBounds) {
  return useQuery({
    queryKey: queryKeys.presenceStats(period?.from, period?.to),
    queryFn: () => presencesApi.getPresenceStats(period ? { from: period.from, to: period.to } : {}),
  });
}

/**
 * `playerIds`: the players the filter left visible, so the over-time chart follows the filters.
 * `undefined` is the whole roster. `period`: the same bounds the stats read (rule 17g).
 */
export function usePresenceTrend(
  playerIds?: number[],
  period?: PresencePeriodBounds,
  options?: QueryOverrides<Awaited<ReturnType<typeof presencesApi.getPresenceTrend>>>
) {
  const key = playerIds ? [...playerIds].sort((a, b) => a - b).join(",") : "all";
  return useQuery({
    queryKey: queryKeys.presenceTrend(key, period?.from, period?.to),
    queryFn: () =>
      presencesApi.getPresenceTrend({
        ...(period ? { from: period.from, to: period.to } : {}),
        ...(playerIds ? { playerIds } : {}),
      }),
    ...options,
  });
}

export function usePendingValidation(range: { from: string; to: string }) {
  return useQuery({
    queryKey: queryKeys.presencePending(range.from, range.to),
    queryFn: () => presencesApi.getPendingValidation(range),
  });
}

/** The trigger's number; keyed under `presence-pending` so every write invalidates it with the list. */
export function usePendingValidationCount(range: { from: string; to: string }) {
  return useQuery({
    queryKey: queryKeys.presencePendingCount(range.from, range.to),
    queryFn: () => presencesApi.getPendingValidationCount(range),
  });
}

/**
 * What a presence write refreshes: stats, every trend, and the `presence-pending` prefix (queue,
 * count and the Presences badge). Returns a function to call after a write.
 */
export function useInvalidatePresences() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.presenceStatsPrefix }),
      queryClient.invalidateQueries({ queryKey: queryKeys.presenceTrendPrefix }),
      queryClient.invalidateQueries({ queryKey: queryKeys.presencePendingPrefix }),
    ]);
}

/**
 * settings.coach-presences-view rule 5 (PAD-837b): the coach's saved columns, read once per mount.
 * No refocus or reconnect refetch (a late answer must never move columns the coach is looking at;
 * the screens also ignore one that lands after a choice); a failed load is not retried into the
 * screen: it shows the column list's defaults.
 */
export function useCoachPresencesView() {
  return useQuery({
    queryKey: queryKeys.coachPresencesView,
    queryFn: () => presencesViewApi.getCoachPresencesView(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Saves the whole view (rule 4); the cache takes the server's answer so a re-open reads it back. */
export function useSaveCoachPresencesView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (view: CoachPresencesView) => presencesViewApi.putCoachPresencesView(view),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.coachPresencesView, saved);
    },
  });
}
