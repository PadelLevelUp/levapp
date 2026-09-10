import type { PresencePlayerStats, PresenceStatsTotals } from "@levelup/types";

/**
 * PAD-192 (attendance.validation rule 17a): the presences charts follow the
 * players-table filters. The ranking re-derives from the filtered rows on its
 * own; the academy/private split needs totals for the narrowed roster, which
 * the server's roster-wide `totals` cannot provide — so they are summed here,
 * identically on both shells.
 *
 * Only the fields the split reads (and `presences`/`academyShare`, which are
 * sums of them) are recomputed; everything else keeps the roster-wide value.
 */
export function narrowedTotals(
  rows: PresencePlayerStats[],
  base: PresenceStatsTotals | undefined
): PresenceStatsTotals | undefined {
  if (!base) return undefined;
  const privateCount = rows.reduce((sum, p) => sum + p.private, 0);
  const academy = rows.reduce((sum, p) => sum + p.academy, 0);
  const presences = privateCount + academy;
  return {
    ...base,
    private: privateCount,
    academy,
    presences,
    academyShare: presences ? Math.round((100 * academy) / presences) : 0,
  };
}

/** The caption's numbers while a filter is active; `null` when none is. */
export function chartScope(
  filtered: PresencePlayerStats[] | null,
  roster: PresencePlayerStats[]
): { shown: number; total: number } | null {
  return filtered ? { shown: filtered.length, total: roster.length } : null;
}
