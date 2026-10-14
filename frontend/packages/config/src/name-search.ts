/**
 * players.search (PAD-665): the one rule for every coach-side player search, on web and iOS.
 *
 * PAD-516 (players.list rule 3) made a name search match when EVERY typed word appears in the
 * name, in any order — "pedro sousa" finds "Pedro Mesquita e Sousa". PAD-665 keeps that as one
 * tier and ranks the matches: the whole query at the start of a field, then every word at the
 * start of a word ("jo mor" → "João Moreira"), then every word anywhere, then small typos
 * ("Ricrdo" → "Ricardo"). Tiers only add — nobody PAD-516 found disappears.
 *
 * The backend twin is `player_service.rank_player_match`; both run `name-search.cases.json`.
 */

/** B-531: letters NFKD cannot take apart. Mapped before folding, the same in both twins. */
const SPECIAL_LETTERS: Record<string, string> = {
  ł: "l", Ł: "l", ø: "o", Ø: "o", ß: "ss", ẞ: "ss", đ: "d", Đ: "d",
  æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ı: "i",
};
const SPECIAL_RE = new RegExp(`[${Object.keys(SPECIAL_LETTERS).join("")}]`, "g");

/**
 * Fold text for comparison: special letters mapped, lower-cased, accents dropped (NFKD minus
 * combining marks), anything that is not a letter, a digit or a space dropped (PAD-516:
 * "Ana-Rita O'Neil" → "anarita oneil"), spaces collapsed. Letters of every script are kept
 * (B-531: "Łukasz" → "lukasz", never "ukasz").
 */
export function foldSearchText(s: string | null | undefined): string {
  return (s ?? "")
    .replace(SPECIAL_RE, (ch) => SPECIAL_LETTERS[ch])
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** PAD-516's name for the fold. */
export const normalizeSearchText = foldSearchText;

/** The query's words, folded; an empty query has none. */
export function searchWords(query: string): string[] {
  const folded = foldSearchText(query);
  return folded ? folded.split(" ") : [];
}

/** What a player can be found by. A field the screen's payload does not carry stays absent. */
export interface PlayerSearchFields {
  name: string | null | undefined;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** 0 whole-query prefix · 1 every word at a word start · 2 every word anywhere · 3 typo. */
export type PlayerMatchTier = 0 | 1 | 2 | 3;

/** Optimal string alignment distance: Levenshtein plus one adjacent swap ("Marinoh"). */
function typoDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

const MIN_TYPO_WORD = 4;
const MIN_PHONE_DIGITS = 3;

/**
 * The best tier this player reaches for the query, or null when they do not match. A blank query
 * matches everyone at tier 0; a query with text but no letter or digit ("%") matches nobody.
 */
export function rankPlayerMatch(fields: PlayerSearchFields, query: string): PlayerMatchTier | null {
  if (!(query ?? "").trim()) return 0;
  const words = searchWords(query);
  if (words.length === 0) return null;
  const texts = [fields.name, fields.nickname, fields.email].map(foldSearchText).filter(Boolean);
  const phone = (fields.phone ?? "").replace(/\D/g, "");
  if (texts.length === 0 && !phone) return null;
  const tokens = texts.flatMap((t) => t.split(" "));

  const whole = words.join(" ");
  if (texts.some((t) => t.startsWith(whole))) return 0;
  const atStart = (w: string) => tokens.some((t) => t.startsWith(w));
  if (words.every(atStart)) return 1;
  const inPhone = (w: string) => w.length >= MIN_PHONE_DIGITS && /^\d+$/.test(w) && phone.includes(w);
  const anywhere = (w: string) => texts.some((t) => t.includes(w)) || inPhone(w);
  if (words.every(anywhere)) return 2;
  const nearly = (w: string) => {
    if (anywhere(w)) return true;
    if (w.length < MIN_TYPO_WORD || /\d/.test(w)) return false;
    const limit = w.length >= 7 ? 2 : 1;
    return tokens.some(
      (t) => typoDistance(w, t) <= limit || typoDistance(w, t.slice(0, w.length)) <= limit
    );
  };
  if (words.every(nearly)) return 3;
  return null;
}

/** True when the name matches the query at any tier (PAD-516's question, PAD-665's rule). */
export function nameMatchesQuery(name: string | null | undefined, query: string): boolean {
  return rankPlayerMatch({ name }, query) !== null;
}

/**
 * The matches, best first: tier, then folded name, then name as written, then id. A blank query
 * returns the items as they came (each screen keeps its own order).
 */
export function searchPlayers<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => PlayerSearchFields & { id?: string | number | null }
): T[] {
  if (!(query ?? "").trim()) return [...items];
  const ranked: { item: T; tier: PlayerMatchTier; folded: string; name: string; id: string }[] = [];
  for (const item of items) {
    const fields = fieldsOf(item);
    const tier = rankPlayerMatch(fields, query);
    if (tier === null) continue;
    ranked.push({
      item,
      tier,
      folded: foldSearchText(fields.name),
      name: fields.name ?? "",
      id: String(fields.id ?? ""),
    });
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      cmp(a.folded, b.folded) ||
      cmp(a.name, b.name) ||
      a.id.localeCompare(b.id, undefined, { numeric: true })
  );
  return ranked.map((r) => r.item);
}
