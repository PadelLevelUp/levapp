import { nameMatchesQuery } from "./name-search";

/**
 * PAD-537 (attendance.validation rule 8a): the players a coach can add to a past class, as the
 * validate view lists them — alphabetical by name (accents and case ignored, Portuguese order),
 * then narrowed by the search with the app's one name rule (`nameMatchesQuery`, PAD-516: every
 * typed word, in any order). Both shells read this; neither sorts or filters on its own.
 */
export function walkInOptions<T extends { name: string }>(roster: readonly T[], query: string): T[] {
  return [...roster]
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }))
    .filter((option) => nameMatchesQuery(option.name, query));
}
