import { rosterNicknameOf } from "./coach-display-name";
import { searchPlayers } from "./name-search";

/**
 * PAD-537 (attendance.validation rule 8a): the players a coach can add to a past class, as the
 * validate view lists them — alphabetical by name (accents and case ignored, Portuguese order),
 * then narrowed by the search with the app's one name rule (`searchPlayers`, PAD-516/PAD-665: every
 * typed word, in any order). A typed search lists the best match first (players.search rule 6);
 * a blank one keeps the alphabetical list. Both shells read this; neither sorts or filters on its own.
 */
export function walkInOptions<T extends { name: string; nickname?: string | null; displayName?: string | null }>(
  roster: readonly T[],
  query: string
): T[] {
  // PAD-683: ordered by the name the coach reads; searched by the real name AND the nickname (rule 5).
  const shown = (o: T) => o.displayName ?? o.name;
  const alphabetical = [...roster].sort((a, b) => shown(a).localeCompare(shown(b), "pt", { sensitivity: "base" }));
  return searchPlayers(alphabetical, query, (option) => ({
    name: option.name,
    nickname: rosterNicknameOf(option),
  }));
}

/**
 * PAD-787 (attendance.validation rule 8b): why the walk-in search lists nobody. The picker only
 * offers roster players not yet in the class, so "no player found" hid two different answers:
 * - `inClass`: the typed name is someone already in this class (maybe shown under the coach's
 *   nickname, which is why the coach did not see them). `playerId` is the first such match,
 *   by the same name rule as the picker;
 * - `notOnRoster`: nobody in the class either. The client cannot tell a student linked to another
 *   coach from a removed account (`/coach_players` leaves both out), so one answer covers both.
 * `none` when the search is blank or lists someone: there is nothing to explain.
 */
export type WalkInEmptyReason =
  | { kind: "none" }
  | { kind: "inClass"; playerId: number }
  | { kind: "notOnRoster" };

export function walkInEmptyReason<
  T extends { id: number; name: string; nickname?: string | null; displayName?: string | null },
>(inClass: readonly T[], offeredCount: number, query: string): WalkInEmptyReason {
  if (!query.trim() || offeredCount > 0) return { kind: "none" };
  const match = walkInOptions(inClass, query)[0];
  return match ? { kind: "inClass", playerId: match.id } : { kind: "notOnRoster" };
}
