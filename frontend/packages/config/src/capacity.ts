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

/**
 * The count a sheet shows (calendar.event-detail rule 5, PO M-7512). A student's payload lists only their own
 * row, so recounting it reads 1 whatever the class holds: a student takes the payload's `participantCount`, the
 * number the card carries, from the same server helper. An older server sends none, and the coach (whose
 * lists are complete, and whose edit draft changes them, B-240) keeps the local count.
 */
export function viewFilledSpots(
  serverCount: number | null | undefined,
  isCoach: boolean,
  localCount: number
): number {
  return !isCoach && typeof serverCount === "number" ? serverCount : localCount;
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

/**
 * Confirmed spots for a LISTED set of participants (calendar.event-detail rule 27, UI idea 3):
 * the listed students whose presence status is `present`, i.e. `LessonInstance.confirmed_spots`
 * applied to the list, as `effectiveFilledSpotsOf` applies `effective_filled_spots`. A `present`
 * row for someone off the list is not counted, and the result never exceeds the filled spots of
 * the same lists. Ids compare as strings. It feeds the coach's fill bar and is never printed.
 */
export function confirmedSpotsOf(
  participants: readonly { id: string | number }[],
  presences: readonly PresenceWithPlayerLike[] | null | undefined
): number {
  const listed = new Set(participants.map((p) => String(p.id)));
  const coming = new Set(
    (presences ?? [])
      .filter((p) => p.status === "present" && p.playerId != null && listed.has(String(p.playerId)))
      .map((p) => String(p.playerId))
  );
  return Math.min(coming.size, effectiveFilledSpotsOf(participants, presences));
}

/**
 * Whether the coach's capacity box draws the fill bar, and in which tone (rule 27). No bar while
 * editing, for a canceled class, for a class with no capacity, or for a viewer who cannot manage
 * the class (a student receives only their own presence, so a split would be false). The tone is
 * `warning` (amber) while the class is not completed, has not ended and has a free seat; otherwise
 * `current`, the box's own text colour.
 */
export function capacityBarOf(input: {
  capacity: number | null | undefined;
  filled: number;
  status?: string | null;
  ended: boolean;
  canManage: boolean;
  editing: boolean;
}): { tone: "current" | "warning" } | null {
  const { capacity, filled, status, ended, canManage, editing } = input;
  if (!canManage || editing || status === "canceled" || !capacity || capacity <= 0) return null;
  const open = filled < capacity;
  return { tone: !ended && status !== "completed" && open ? "warning" : "current" };
}
