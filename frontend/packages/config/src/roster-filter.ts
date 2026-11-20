/**
 * players.list rule 5 (PAD-834): the roster's four filters, of which the screen shows one.
 * A URL that carries more than one keeps the first of this order and drops the rest.
 */
export const ROSTER_FILTERS = ["pending", "incomplete", "missing_level", "missing_side"] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

/** The one filter a Players URL asks for, or null. `get` reads a query param ("true" turns it on). */
export function rosterFilterFromParams(get: (name: string) => string | null | undefined): RosterFilter | null {
  return ROSTER_FILTERS.find((name) => get(name) === "true") ?? null;
}

/** The query params of `getCoachPlayersPaginated` for one filter. */
export function rosterFilterQuery(filter: RosterFilter | null): {
  pending: boolean;
  incomplete: boolean;
  missingLevel: boolean;
  missingSide: boolean;
} {
  return {
    pending: filter === "pending",
    incomplete: filter === "incomplete",
    missingLevel: filter === "missing_level",
    missingSide: filter === "missing_side",
  };
}
