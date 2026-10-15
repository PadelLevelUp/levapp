import { searchPlayers } from "./name-search";

/**
 * PAD-537 (attendance.validation rule 8a): the players a coach can add to a past class, as the
 * validate view lists them — alphabetical by name (accents and case ignored, Portuguese order),
 * then narrowed by the search with the app's one name rule (`searchPlayers`, PAD-516/PAD-665: every
 * typed word, in any order). A typed search lists the best match first (players.search rule 6);
 * a blank one keeps the alphabetical list. Both shells read this; neither sorts or filters on its own.
 */
export function walkInOptions<T extends { name: string }>(roster: readonly T[], query: string): T[] {
  const alphabetical = [...roster].sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
  return searchPlayers(alphabetical, query, (option) => ({ name: option.name }));
}
