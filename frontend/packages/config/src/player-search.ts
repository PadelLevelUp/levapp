import { rosterNicknameOf } from "./coach-display-name";
import { searchPlayers } from "./name-search";

/**
 * players.search (PAD-665): the call sites of the shared name rule that more than one surface
 * (or both shells) needs, so the web and iOS screens read the same line.
 */

/** A roster row as the coach-side pickers hold it; email and phone only where the payload has them. */
interface RosterPlayerLike {
  playerId?: string | number | null;
  name: string;
  nickname?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * The coach's roster, narrowed and ordered by the shared rule (rule 4: email and phone are
 * searched only because the roster payload already carries them). A blank query returns the
 * rows unchanged, in the screen's own order.
 */
export function searchRoster<T extends RosterPlayerLike>(items: readonly T[], query: string): T[] {
  return searchPlayers(items, query, (p) => rosterSearchFields(p));
}

/**
 * The fields the shared rule reads from a roster-shaped row (PAD-660, PAD-683): the real name,
 * the coach's own nickname (so either name finds the student), and email / phone where the payload
 * has them. For a surface that calls `searchPlayers` itself (the presences screens).
 */
export function rosterSearchFields(p: RosterPlayerLike) {
  return {
    name: p.name,
    nickname: rosterNicknameOf(p), // PAD-660: the coach's own nickname finds the student too
    email: p.email,
    phone: p.phone,
    id: p.playerId,
  };
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
  {
    coach,
    nicknameOf,
  }: {
    coach: boolean;
    /** PAD-683 (players.nickname rule 5): the coach's nickname for the row, so either name finds it. */
    nicknameOf?: (item: T) => string | null;
  }
): T[] {
  if (coach) {
    return searchPlayers(items, query, (item) => ({
      name: nameOf(item),
      nickname: nicknameOf ? nicknameOf(item) : undefined,
    }));
  }
  return items.filter((item) => legacyContains(nameOf(item), query));
}

/** A coach's roster row, as the conversation-list search reads it. */
interface SearchRosterRow {
  userId?: string | number | null;
  name?: string | null;
  nickname?: string | null;
}

/**
 * The Messages tab's search (messaging.conversations rule 20, PAD-831): the loaded conversation
 * rows that match and, for a coach, the people they may message who match and have no loaded row
 * ("start a conversation"). Either of a student's names finds them. A student viewer keeps the
 * plain substring over their rows (`searchPeopleByName`); a blank query returns the rows as they
 * came and nobody else.
 */
export function searchMessages<
  C extends { participantId?: string | number | null; participantName?: string | null },
  P extends { id: string | number; name: string },
>(
  conversations: readonly C[],
  query: string,
  nameOf: (conversation: C) => string,
  {
    coach,
    people = [],
    roster = [],
  }: {
    coach: boolean;
    /** Rule 7's set; pass none under "Não lidas". */
    people?: readonly P[];
    roster?: readonly SearchRosterRow[];
  }
): { conversations: C[]; people: P[] } {
  if (!coach) {
    return { conversations: searchPeopleByName(conversations, query, nameOf, { coach }), people: [] };
  }
  const rosterById = new Map(roster.filter((r) => r.userId != null).map((r) => [String(r.userId), r]));
  const personById = new Map(people.map((p) => [String(p.id), p]));
  const matching = searchPeopleByName(conversations, query, nameOf, {
    coach,
    nicknameOf: (c) => {
      if (c.participantId == null) return null;
      // The row shows one of the student's names; the other one is searched beside it.
      const row = rosterById.get(String(c.participantId));
      const realName = row?.name ?? personById.get(String(c.participantId))?.name;
      if (realName && realName !== c.participantName) return realName;
      return row ? rosterNicknameOf(row) : null;
    },
  });
  if (!query.trim()) return { conversations: matching, people: [] };

  const listed = new Set(conversations.map((c) => String(c.participantId)));
  const others = people.filter((p) => !listed.has(String(p.id)));
  return {
    conversations: matching,
    people: searchPeopleByName(others, query, (p) => p.name, {
      coach,
      nicknameOf: (p) => rosterNicknameOf(rosterById.get(String(p.id)) ?? {}),
    }),
  };
}
