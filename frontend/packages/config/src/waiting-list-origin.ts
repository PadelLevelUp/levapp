/**
 * PAD-547 (calendar.event-detail rule 19, notifications.waiting-list rule 20): the origin label of
 * a class's waiting-list row, read by both shells.
 */
import type { CoachClassWaitingListRow } from "@levelup/types";
import { nameMatchesQuery } from "./name-search";

export function waitingListOriginKey(row: Pick<CoachClassWaitingListRow, "origin" | "seriesScoped">): string {
  if (row.origin === "standing") {
    return row.seriesScoped
      ? "calendar.detail.waitingListOriginStandingSeries"
      : "calendar.detail.waitingListOriginStanding";
  }
  return row.origin === "coach" ? "calendar.detail.waitingListOriginCoach" : "calendar.detail.waitingListOriginStudent";
}

/**
 * PAD-560 (calendar.event-detail rule 19): how long the student is on this list, from the row's
 * `scope` (the four values are described on `WaitingListScope` in @levelup/types) — a translation
 * key, with the end date for the dated scopes formatted by the caller (`formatShortDate` in the
 * account's locale). A coach-wide standing row (`standing`) is dated too;
 * `waitingListManagedInSettings` says why the class offers no edit of it.
 */
export function waitingListScopeLabel(
  row: Pick<CoachClassWaitingListRow, "scope" | "expiresOn">,
  formatDate: (iso: string) => string,
): { key: string; params?: { date: string } } {
  switch (row.scope) {
    case "occurrence":
      return { key: "calendar.detail.waitingListScopeOccurrence" };
    case "series":
      return { key: "calendar.detail.waitingListScopeSeries" };
    case "period":
    case "standing":
      // A standing entry always has an end (rule 2); "—" only if a payload ever omits it.
      return { key: "calendar.detail.waitingListScopeUntil", params: { date: row.expiresOn ? formatDate(row.expiresOn) : "—" } };
  }
}

/** A coach-wide standing row is changed in Settings, not from the class (rule 19). */
export function waitingListRowIsManagedInSettings(row: Pick<CoachClassWaitingListRow, "scope">): boolean {
  return row.scope === "standing";
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

/**
 * PAD-558 (calendar.event-detail rule 20): the picker's name search, under the class editor's
 * rule (`nameMatchesQuery`, PAD-516). It only narrows what is offered: the chosen student stays
 * listed, so the choice the confirm button acts on is always on screen.
 */
export function waitingListPickerOptions<P extends { playerId: number | string; name?: string | null }>(
  candidates: P[],
  query: string,
  chosenId: string | null,
): P[] {
  return candidates.filter((p) => String(p.playerId) === chosenId || nameMatchesQuery(p.name, query));
}
