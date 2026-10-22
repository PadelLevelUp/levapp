import { rosterSearchFields, searchPlayers } from "@levelup/config";

/**
 * players.search (PAD-665): the presences table's name filter, on the shared rule. Pure, so a
 * unit test can reach it. The minimum-total and maximum-unjustified bounds stay in the table.
 */

/**
 * Rows whose name matches; a blank query returns them as given. The table always has a sort of its
 * own, so it re-sorts these — the rule only filters here (players.search rule 6, decision
 * 2026-10-14 (a)).
 *
 * PAD-683 (players.nickname rule 5): `rosterSearchFields` passes the row's nickname as the rule's
 * `nickname` field, so a nickname kept off the name still finds the student.
 */
export function searchPresencePlayers<
  T extends {
    playerId: number | string;
    name: string;
    nickname?: string | null;
    displayName?: string | null;
  },
>(players: readonly T[], query: string): T[] {
  return searchPlayers(players, query, rosterSearchFields);
}
