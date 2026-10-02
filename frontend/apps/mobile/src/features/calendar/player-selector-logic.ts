import type { CoachPlayer } from "@levelup/types";

/**
 * The participant picker's rules (classes.create rule 10, classes.edit rule 9,
 * PAD-474), ported from web's components/calendar/PlayerSelector.tsx so both
 * shells search, filter and mark the same way. Ids are compared as strings: the
 * API serialises some as numbers.
 */

/** Accents, case and punctuation never stop a search ("alvares" finds "Álvares"). */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase();
}

/** A search overrides the level filter, as on web. */
export function filterPlayers(
  players: CoachPlayer[],
  { search, levelId }: { search: string; levelId: string | null }
): CoachPlayer[] {
  if (search.trim().length > 0) {
    const q = normalizeName(search);
    return players.filter((p) => normalizeName(p.name).includes(q));
  }
  if (levelId) {
    return players.filter((p) => String(p.levelId) === String(levelId));
  }
  return players;
}

/** A student outside the class's level is marked; a class without a level marks nobody. */
export function isOutOfLevel(
  player: CoachPlayer,
  classLevelId: string | null | undefined
): boolean {
  if (classLevelId === null || classLevelId === undefined || classLevelId === "") {
    return false;
  }
  return String(player.levelId) !== String(classLevelId);
}

export function selectedPlayersOf(players: CoachPlayer[], ids: string[]): CoachPlayer[] {
  const chosen = new Set(ids.map(String));
  return players.filter((p) => chosen.has(String(p.playerId)));
}

export function togglePlayerId(ids: string[], id: string): string[] {
  const key = String(id);
  const normalized = ids.map(String);
  return normalized.includes(key)
    ? normalized.filter((x) => x !== key)
    : [...normalized, key];
}
