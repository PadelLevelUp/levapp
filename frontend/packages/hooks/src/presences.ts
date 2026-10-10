import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as playersApi from "@levelup/api/src/resources/players";
import * as presencesApi from "@levelup/api/src/resources/presences";
import { queryKeys } from "./queryKeys";

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

export function usePresenceStats() {
  return useQuery({
    queryKey: queryKeys.presenceStats,
    queryFn: () => presencesApi.getPresenceStats(),
  });
}

/**
 * `playerIds`: the players the filter left visible, so the over-time chart follows the filters.
 * `undefined` is the whole roster.
 */
export function usePresenceTrend(playerIds?: number[]) {
  const key = playerIds ? [...playerIds].sort((a, b) => a - b).join(",") : "all";
  return useQuery({
    queryKey: queryKeys.presenceTrend(key),
    queryFn: () => presencesApi.getPresenceTrend(playerIds ? { playerIds } : {}),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.presenceStats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.presenceTrendPrefix }),
      queryClient.invalidateQueries({ queryKey: queryKeys.presencePendingPrefix }),
    ]);
}
