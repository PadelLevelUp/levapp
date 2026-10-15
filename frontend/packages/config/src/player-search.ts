import { searchPlayers } from "./name-search";

/**
 * players.search (PAD-665): the call sites of the shared name rule that more than one surface
 * (or both shells) needs, so the web and iOS screens read the same line.
 */

/** A roster row as the coach-side pickers hold it; email and phone only where the payload has them. */
interface RosterPlayerLike {
  playerId?: string | number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * The coach's roster, narrowed and ordered by the shared rule (rule 4: email and phone are
 * searched only because the roster payload already carries them). A blank query returns the
 * rows unchanged, in the screen's own order.
 */
export function searchRoster<T extends RosterPlayerLike>(items: readonly T[], query: string): T[] {
  return searchPlayers(items, query, (p) => ({
    name: p.name,
    email: p.email,
    phone: p.phone,
    id: p.playerId,
  }));
}

// student side, out of PAD-665 scope (players.search rule 8)
const legacyContains = (name: string, query: string): boolean =>
  name.toLowerCase().includes(query.toLowerCase());

/**
 * The messaging screens (new conversation, conversation list) serve coaches and students. The
 * shared rule is the coach's (rule 8); a student keeps the plain substring match they always had.
 */
export function searchPeopleByName<T>(
  items: readonly T[],
  query: string,
  nameOf: (item: T) => string,
  { coach }: { coach: boolean }
): T[] {
  if (coach) return searchPlayers(items, query, (item) => ({ name: nameOf(item) }));
  return items.filter((item) => legacyContains(nameOf(item), query));
}
