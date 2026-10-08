/**
 * PAD-547 (calendar.event-detail rule 19, notifications.waiting-list rule 20): the origin label of
 * a class's waiting-list row, read by both shells.
 */
import type { CoachClassWaitingListRow } from "@levelup/types";

export function waitingListOriginKey(row: Pick<CoachClassWaitingListRow, "origin" | "seriesScoped">): string {
  if (row.origin === "standing") {
    return row.seriesScoped
      ? "calendar.detail.waitingListOriginStandingSeries"
      : "calendar.detail.waitingListOriginStanding";
  }
  return row.origin === "coach" ? "calendar.detail.waitingListOriginCoach" : "calendar.detail.waitingListOriginStudent";
}

/** Roster students the coach may add: not in the class and not already on its list. */
export function waitingListCandidates<P extends { playerId: number | string }>(
  roster: P[],
  enrolledIds: Array<number | string>,
  rows: Array<Pick<CoachClassWaitingListRow, "playerId">>,
): P[] {
  const taken = new Set([...enrolledIds.map(String), ...rows.map((r) => String(r.playerId))]);
  return roster.filter((p) => !taken.has(String(p.playerId)));
}
