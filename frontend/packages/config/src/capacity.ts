/**
 * Class capacity rules (PAD-71).
 *
 * SINGLE SOURCE OF TRUTH on the client for "how full is this class". Mirrors
 * the backend's `LessonInstance.effective_filled_spots`, which is what the
 * calendar payload's `participantCount` already carries — this helper exists so
 * that surfaces holding a locally-mutated participant/presence list (the web
 * class-detail sheet, the mobile class screen) derive the same number instead of
 * reimplementing the rule.
 *
 * Rule: enrolled players minus everyone whose presence status is `absent`
 * (declined the invite or cancelled), floored at 0. Players who have not
 * answered yet still occupy their spot and DO count.
 */

/** Minimal shape needed from a presence row. */
export interface PresenceLike {
  status?: string | null;
}

/**
 * Effective filled spots for a class instance.
 *
 * @param participantCount number of enrolled players (or the participants array length)
 * @param presences presence rows for the same instance
 */
export function effectiveFilledSpots(
  participantCount: number,
  presences: readonly PresenceLike[] | null | undefined
): number {
  const declined = (presences ?? []).filter((p) => p?.status === "absent").length;
  return Math.max(0, participantCount - declined);
}
