import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as playersApi from "@levelup/api/src/resources/players";
import * as presencesApi from "@levelup/api/src/resources/presences";
import { useTranslation } from "react-i18next";
import type { AbsenceJustification, PresenceStatus } from "@levelup/types";

import type { RosterOption } from "./validate-state";

/**
 * PAD-140 — feature-local hooks for the mobile Presences tab.
 *
 * The API layer is already shared (`@levelup/api/resources/presences`), so this
 * module only adds the query/mutation wiring. The web shell drives the same
 * endpoints through its own `useState`/`useEffect` loop; both talk to the same
 * functions, so the platforms cannot drift on request shape.
 */

export const presenceKeys = {
  stats: ["presence-stats"] as const,
  trend: ["presence-trend"] as const,
  pending: (from: string, to: string) =>
    ["presence-pending", from, to] as const,
  roster: ["coach-players"] as const,
};

export function usePresenceStats() {
  return useQuery({
    queryKey: presenceKeys.stats,
    queryFn: () => presencesApi.getPresenceStats(),
  });
}

/**
 * `playerIds` (PAD-192): the players the filter sheet left visible, so the
 * over-time chart follows the filters like the other two. `undefined` is the
 * whole roster.
 */
export function usePresenceTrend(playerIds?: number[]) {
  const key = playerIds ? [...playerIds].sort((a, b) => a - b).join(",") : "all";
  return useQuery({
    queryKey: [...presenceKeys.trend, key],
    queryFn: () => presencesApi.getPresenceTrend(playerIds ? { playerIds } : {}),
  });
}

export function usePendingValidation(range: { from: string; to: string }) {
  return useQuery({
    queryKey: presenceKeys.pending(range.from, range.to),
    queryFn: () => presencesApi.getPendingValidation(range),
  });
}

/**
 * PAD-185 — the coach's own players, for the walk-in picker.
 *
 * `playerId`, not `id`: the latter is the coach↔player association's own id,
 * which no presence endpoint accepts. Web's PresencesPage makes exactly the same
 * mapping; getting it wrong produces a 404 only at add time.
 *
 * A failure is swallowed into an empty roster rather than surfaced. It costs the
 * walk-in picker and nothing else — the queue, the marks and validating all
 * still work — so an error state here would alarm a coach out of a task that is
 * not actually blocked.
 */
export function useCoachRoster(): RosterOption[] {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: presenceKeys.roster,
    queryFn: () => playersApi.getCoachPlayers(),
  });
  return (query.data ?? []).map((player) => ({
    id: Number(player.playerId),
    name: player.name || t("presences.unknownPlayer"),
  }));
}

/** Everything the tab shows is derived from presences, so any write refetches all three. */
function useInvalidatePresences() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: presenceKeys.stats }),
      queryClient.invalidateQueries({ queryKey: presenceKeys.trend }),
      queryClient.invalidateQueries({ queryKey: ["presence-pending"] }),
    ]);
}

export interface ValidatePayload {
  lessonInstanceId: number;
  presences: Array<{
    playerId: number;
    status: PresenceStatus;
    justification?: AbsenceJustification;
  }>;
}

export function useValidateClasses() {
  const invalidate = useInvalidatePresences();
  return useMutation({
    mutationFn: async (classes: ValidatePayload[]) => {
      // Sequential, matching web: each call can materialize rows and touch the
      // same instance, and a coach validating a handful of classes is not a
      // throughput problem.
      for (const item of classes) {
        await presencesApi.validateClassPresences(
          item.lessonInstanceId,
          item.presences
        );
      }
    },
    onSuccess: invalidate,
  });
}

export function useUnvalidateClass() {
  const invalidate = useInvalidatePresences();
  return useMutation({
    mutationFn: (lessonInstanceId: number) =>
      presencesApi.unvalidateClass(lessonInstanceId),
    onSuccess: invalidate,
  });
}

/**
 * Monday–Sunday bounds for a week `offset` weeks from today, in UTC.
 *
 * UTC and bare `YYYY-MM-DD`, identical to the web shell: `start_datetime` is
 * stored naive-UTC, so a local-time boundary would shift the week and drop a
 * late class into the wrong one.
 */
export function weekBounds(offset: number): { from: string; to: string } {
  const now = new Date();
  const dayOfWeek = (now.getUTCDay() + 6) % 7; // Monday-first
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - dayOfWeek + offset * 7
    )
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(sunday) };
}
