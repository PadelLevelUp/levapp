/**
 * PAD-547 (calendar.event-detail rule 19, notifications.waiting-list rule 20): the origin label of
 * a class's waiting-list row, read by both shells.
 */
import type { ClassWaitingListScopeRequest, CoachClassWaitingListRow } from "@levelup/types";
import { nameMatchesQuery } from "./name-search";
import { DEFAULT_STANDING_PRESET, isStandingEndAllowed, standingEndFor } from "./standing-end";

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

/**
 * PAD-560 (notifications.waiting-list rule 19): the date a whole-series entry will run to, as the
 * dialog tells the coach before saving — the series' end, or 12 months from today when the series
 * has no end or ends later (rule 2's window). `today` and `recurrenceEnd` are club days `YYYY-MM-DD`.
 */
export function wholeSeriesEndPreview(recurrenceEnd: string | null | undefined, today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const cap = new Date(Date.UTC(y + 1, m - 1, d));
  const capISO = cap.toISOString().slice(0, 10);
  if (!recurrenceEnd || recurrenceEnd < today) return capISO;
  return recurrenceEnd < capISO ? recurrenceEnd : capISO;
}

/** The scopes the add/edit dialog offers: a one-off class has this class only (rules 19, 19a). */
export function waitingListScopeOptions(isRecurring: boolean): Array<"occurrence" | "series" | "period"> {
  return isRecurring ? ["occurrence", "series", "period"] : ["occurrence"];
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

// ── PAD-560 (calendar.event-detail rule 20): the add/edit dialog's scope logic, one copy for both
// shells (review of part B: the two dialogs had duplicated it line for line). ───────────────────

/** The scopes the dialog chooses between (rules 18, 19, 19a). */
export type WaitingListDialogScope = ClassWaitingListScopeRequest["scope"];
/** How a period is given (rule 19a): a number of classes, or an end date. */
export type WaitingListPeriodMode = "classes" | "date";

/** Rule 19a's bound on "durante X aulas"; the server refuses more (`WAITING_LIST_MAX_PERIOD_CLASSES` there too). */
export const WAITING_LIST_MAX_PERIOD_CLASSES = 52;
export const DEFAULT_WAITING_LIST_PERIOD_CLASSES = 4;

export const WAITING_LIST_SCOPE_KEYS: Record<WaitingListDialogScope, string> = {
  occurrence: "calendar.detail.waitingListScopeOccurrence",
  series: "calendar.detail.waitingListScopeSeries",
  period: "calendar.detail.waitingListScopePeriod",
};

/** What the dialog's choice asks the server for (rules 18, 19, 19a). */
export function waitingListScopeRequest(
  scope: WaitingListDialogScope,
  periodMode: WaitingListPeriodMode,
  classes: number,
  expiresOn: string,
): ClassWaitingListScopeRequest {
  if (scope === "occurrence") return { scope: "occurrence" };
  if (scope === "series") return { scope: "series" };
  return periodMode === "classes" ? { scope: "period", classes } : { scope: "period", expiresOn };
}

/** A period needs a count in range or an end date inside rule 2's window; the other scopes ask nothing. */
export function waitingListPeriodValid(
  scope: WaitingListDialogScope,
  periodMode: WaitingListPeriodMode,
  classes: number,
  expiresOn: string,
  today: Date,
): boolean {
  if (scope !== "period") return true;
  if (periodMode === "classes") return classes >= 1 && classes <= WAITING_LIST_MAX_PERIOD_CLASSES;
  return isStandingEndAllowed(expiresOn, today);
}

/**
 * The dialog's opening state (rule 22): editing a row opens on its scope and end — a `period` row
 * on its date; a coach-wide `standing` row never gets here (no edit control) and would read as
 * this class only. Adding opens on this class only with the default period inputs.
 */
export function waitingListDraftFor(
  editing: Pick<CoachClassWaitingListRow, "scope" | "expiresOn"> | null,
  now: Date,
): { scope: WaitingListDialogScope; periodMode: WaitingListPeriodMode; classes: number; expiresOn: string } {
  const fallbackEnd = standingEndFor(DEFAULT_STANDING_PRESET, now);
  if (!editing) return { scope: "occurrence", periodMode: "classes", classes: DEFAULT_WAITING_LIST_PERIOD_CLASSES, expiresOn: fallbackEnd };
  const scope: WaitingListDialogScope = editing.scope === "series" || editing.scope === "period" ? editing.scope : "occurrence";
  return {
    scope,
    periodMode: scope === "period" ? "date" : "classes",
    classes: DEFAULT_WAITING_LIST_PERIOD_CLASSES,
    expiresOn: editing.expiresOn ?? fallbackEnd,
  };
}
