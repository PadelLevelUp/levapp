/**
 * What a presence write refreshes on iOS (attendance.validation rules 22–23). Everything the
 * Presences tab shows derives from presences, and the `presence-pending` prefix covers the queue,
 * its count and the Presences tab badge (`queryKeys.pendingValidationBadge`, PAD-443), so a
 * validate, a bulk validate or an undo refetches all of them.
 *
 * Pure (no React), so the mobile harness can drive it on query-core; `useInvalidatePresences`
 * calls it with the screen's client.
 */
export const PRESENCE_STATS_KEY = ["presence-stats"] as const;
export const PRESENCE_TREND_KEY = ["presence-trend"] as const;
export const PRESENCE_PENDING_PREFIX = ["presence-pending"] as const;

interface Invalidates {
  invalidateQueries(filters: { queryKey: readonly unknown[] }): Promise<unknown>;
}

export function invalidateAfterPresenceWrite(client: Invalidates) {
  return Promise.all(
    [PRESENCE_STATS_KEY, PRESENCE_TREND_KEY, PRESENCE_PENDING_PREFIX].map((queryKey) =>
      client.invalidateQueries({ queryKey })
    )
  );
}
