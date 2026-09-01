import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as presencesApi from "@levelup/api/src/resources/presences";
import type { AbsenceJustification, PresenceStatus } from "@levelup/types";

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
};

export function usePresenceStats() {
  return useQuery({
    queryKey: presenceKeys.stats,
    queryFn: () => presencesApi.getPresenceStats(),
  });
}

export function usePresenceTrend() {
  return useQuery({
    queryKey: presenceKeys.trend,
    queryFn: () => presencesApi.getPresenceTrend(),
  });
}

export function usePendingValidation(range: { from: string; to: string }) {
  return useQuery({
    queryKey: presenceKeys.pending(range.from, range.to),
    queryFn: () => presencesApi.getPendingValidation(range),
  });
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
