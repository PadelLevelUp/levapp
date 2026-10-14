import { searchPlayers } from "@levelup/config";

/**
 * players.search (PAD-665): the presences table's name filter, on the shared rule. Pure, so a
 * unit test can reach it. The minimum-total and maximum-unjustified bounds stay in the table.
 */

/** The table's initial sort (largest total first); a typed name overrides it until another is chosen. */
const DEFAULT_SORT_KEY = "total";
const DEFAULT_SORT_DIR = "desc";

/** Rows whose name matches, best first; a blank query returns them as given. */
export function searchPresencePlayers<T extends { playerId: number | string; name: string }>(
  players: readonly T[],
  query: string
): T[] {
  return searchPlayers(players, query, (p) => ({ name: p.name, id: p.playerId }));
}

/**
 * "relevance" while a name is typed and the coach has left the sort at its default; otherwise the
 * table's own sort. A blank query never reorders anything.
 */
export function presenceRowsOrder(
  query: string,
  sortKey: string,
  sortDir: "asc" | "desc"
): "relevance" | "sort" {
  return query.trim() !== "" && sortKey === DEFAULT_SORT_KEY && sortDir === DEFAULT_SORT_DIR
    ? "relevance"
    : "sort";
}
