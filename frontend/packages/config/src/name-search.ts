/**
 * PAD-516 (players.list rule 3): a name search matches when EVERY typed word appears in the
 * name, in any order — "pedro sousa" finds "Pedro Mesquita e Sousa". Accents, case and
 * punctuation never stop a match ("alvares" finds "Álvares"). One rule for every local
 * player picker on web and iOS.
 */
export function normalizeSearchText(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase();
}

/** The query's words, normalised; an empty query has none. */
export function searchWords(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/**
 * True when every word of `query` is in `name`. A blank query matches everyone; a query with
 * text but no searchable characters ("%", "_", "!!") matches nobody — the server's rule too.
 */
export function nameMatchesQuery(name: string | null | undefined, query: string): boolean {
  if (!(query ?? "").trim()) return true;
  const words = searchWords(query);
  if (words.length === 0) return false;
  const haystack = normalizeSearchText(name ?? "");
  return words.every((w) => haystack.includes(w));
}
