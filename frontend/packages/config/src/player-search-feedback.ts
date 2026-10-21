/**
 * players.search rule 10 (PAD-665): what a player-name search box says while the coach types.
 * Shared so web and iOS show the same line on all twelve surfaces of rule 8.
 */

/** A surface that asks the server waits this long after the last keystroke. */
export const PLAYER_SEARCH_DEBOUNCE_MS = 200;

export type PlayerSearchFeedback = "none" | "searching" | "empty";

/**
 * "none" for a blank query (never an empty message) or when something was found; "searching"
 * while a server search for the current text is in flight; "empty" when a non-blank query
 * matched nobody.
 */
export function playerSearchFeedback(
  query: string,
  { searching, count }: { searching: boolean; count: number }
): PlayerSearchFeedback {
  if (query.trim() === "") return "none";
  if (searching) return "searching";
  return count === 0 ? "empty" : "none";
}
