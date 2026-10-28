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
 *
 * Use `effectiveFilledSpotsOf` when the participant list can diverge from the
 * presences (an edit draft, B-240); `effectiveFilledSpots` when you only hold a count.
 */

/** Minimal shape needed from a presence row. */
export interface PresenceLike {
  status?: string | null;
}

/** A presence row that names its player, for matching against a participant list. */
export interface PresenceWithPlayerLike extends PresenceLike {
  playerId?: string | number | null;
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

/**
 * Effective filled spots for a LISTED set of participants (calendar.event-detail
 * rule 5, B-240): only the declines of the students on the list are subtracted.
 * The web class-detail sheet's edit draft changes its participants as the coach
 * ticks while its presences stay the saved ones, so a declined student the coach
 * unticked must not be subtracted again. Ids compare as strings.
 */
export function effectiveFilledSpotsOf(
  participants: readonly { id: string | number }[],
  presences: readonly PresenceWithPlayerLike[] | null | undefined
): number {
  const listed = new Set(participants.map((p) => String(p.id)));
  return effectiveFilledSpots(
    participants.length,
    (presences ?? []).filter((p) => p.playerId != null && listed.has(String(p.playerId)))
  );
}

/** An i18n key with its values, rendered by the caller's `t`. */
export interface ParticipantsHeader {
  key: string;
  values: Record<string, number | string>;
}

/**
 * The coach's participants header (calendar.event-detail rule 5's named exception, PAD-771):
 * the class's filled spots over its capacity, then how many are open — "12/16 · 4 vagas", or
 * "16/16 · completa" with none. `filled` is `effectiveFilledSpots` (going plus not yet answered),
 * so a not-coming student frees their spot here too. No capacity: the count alone.
 */
export function participantsHeader(filled: number, max: number | null | undefined): ParticipantsHeader {
  if (!max) return { key: "calendar.participants.filledNoMax", values: { current: filled } };
  const open = Math.max(0, max - filled);
  if (open === 0) return { key: "calendar.participants.full", values: { current: filled, max } };
  return { key: "calendar.participants.open", values: { current: filled, max, count: open } };
}
