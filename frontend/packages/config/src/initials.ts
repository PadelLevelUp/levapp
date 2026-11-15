/**
 * messaging.conversations rule 18: the initials an avatar shows when there is no photo.
 *
 * The first letters of the first two words of the name, uppercased, words split on any run of
 * spaces; no name shows `?`. One helper for web and the phone, so the two cannot drift.
 */
export function initialsOf(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
