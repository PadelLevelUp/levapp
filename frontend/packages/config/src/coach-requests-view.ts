/**
 * classes.coach-requests-table rules 5, 7, 11, 12 (PAD-795): the coach's table view (tab, sort,
 * filters) and the one function that turns it into the endpoint's query. Web reads the view from
 * its URL and iOS from its "Filtrar/Ordenar" sheet; both send what this builds, so the same choices
 * send the same params.
 */
import type { CoachRequestsQuery, CoachRequestsSection, CoachRequestsSortKey } from "@levelup/types";

export interface CoachRequestsView {
  section: CoachRequestsSection;
  sortBy?: CoachRequestsSortKey;
  sortDir?: "asc" | "desc";
  kind?: "private" | "academy";
  /** One status of the section; the endpoint takes a list. */
  status?: string;
  side?: "left" | "right" | "both" | "none";
  classFrom?: string;
  classTo?: string;
  classTimeFrom?: string;
  classTimeTo?: string;
  requestedFrom?: string;
  requestedTo?: string;
  playerId?: string;
}

/** Rule 6: Em aberto opens on the nearest class, Histórico on the newest request. */
export const COACH_REQUESTS_DEFAULT_SORT: Record<CoachRequestsSection, { by: CoachRequestsSortKey; dir: "asc" | "desc" }> = {
  open: { by: "class_date", dir: "asc" },
  history: { by: "requested_at", dir: "desc" },
};

/** The statuses each section holds (rule 2): what the status filter offers. */
export const COACH_REQUESTS_SECTION_STATUSES: Record<CoachRequestsSection, string[]> = {
  open: ["pending", "countered"],
  history: ["accepted", "declined", "rejected", "withdrawn", "superseded"],
};

export const COACH_REQUESTS_SORT_KEYS: CoachRequestsSortKey[] = ["class_date", "class_time", "requested_at", "student", "kind", "side", "status"];

/** The sort in force: the view's own, or its section's default. */
export function coachRequestsActiveSort(view: Pick<CoachRequestsView, "section" | "sortBy" | "sortDir">) {
  return view.sortBy ? { by: view.sortBy, dir: view.sortDir ?? ("asc" as const) } : COACH_REQUESTS_DEFAULT_SORT[view.section];
}

/**
 * Rules 6, 11, 12: changing the tab drops the status filter (the sections share no status) and the
 * sort the coach chose, so the new tab opens on its own default order.
 */
export function switchCoachRequestsSection(view: CoachRequestsView, section: CoachRequestsSection): CoachRequestsView {
  const { status: _status, sortBy: _sortBy, sortDir: _sortDir, ...rest } = view;
  return { ...rest, section };
}

export function coachRequestsQuery(view: CoachRequestsView, page = 1): CoachRequestsQuery {
  const query: CoachRequestsQuery = { section: view.section, page };
  if (view.sortBy) {
    query.sortBy = view.sortBy;
    query.sortDir = view.sortDir ?? "asc";
  }
  if (view.kind) query.kind = view.kind;
  if (view.status) query.status = [view.status];
  if (view.side) query.side = view.side;
  if (view.classFrom) query.classFrom = view.classFrom;
  if (view.classTo) query.classTo = view.classTo;
  if (view.classTimeFrom) query.classTimeFrom = view.classTimeFrom;
  if (view.classTimeTo) query.classTimeTo = view.classTimeTo;
  if (view.requestedFrom) query.requestedFrom = view.requestedFrom;
  if (view.requestedTo) query.requestedTo = view.requestedTo;
  if (view.playerId) query.playerId = view.playerId;
  return query;
}
