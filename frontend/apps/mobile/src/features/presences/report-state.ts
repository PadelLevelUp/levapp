import type {
  PresencePlayerStats,
  PresenceStatsTotals,
} from "@levelup/types";

import type { ChartPoint } from "@/components/charts/chart-geometry";

/**
 * PAD-166 — the arithmetic behind the iOS Presences *reporting* surface.
 *
 * Everything here is pure and free of React and of `react-native`, because the
 * mobile vitest project cannot render a React Native tree (see
 * `frontend/CLAUDE.md`): logic left inside a component is logic no automated
 * test can reach. `validate-state.ts` splits the validate flow the same way for
 * the same reason.
 *
 * The rules are web's, not new ones. `PresencePlayersTable.tsx` and
 * `PresenceCharts.tsx` are the reference; where a number could differ between
 * the two shells it is computed here, and the two screens only differ in how
 * they draw it. Filtering and sorting stay client-side on both shells because
 * the endpoint returns one row per roster player — a round trip per keystroke
 * would be slower and worse.
 */

/** Every metric column, in display order. `name` is pinned and never hidden. */
export const PRESENCE_COLUMNS = [
  { key: "name", numeric: false },
  { key: "total", numeric: true },
  { key: "private", numeric: true },
  { key: "academy", numeric: true },
  { key: "justified", numeric: true },
  { key: "unjustified", numeric: true },
  { key: "invitesReceived", numeric: true },
  { key: "invitesJoined", numeric: true },
] as const;

export type PresenceColumn = (typeof PRESENCE_COLUMNS)[number];
export type PresenceColumnKey = PresenceColumn["key"];

/** The pinned column: every other cell is a statement *about* this one. */
export const PINNED_COLUMN: PresenceColumnKey = "name";

export const DEFAULT_VISIBLE_COLUMNS: PresenceColumnKey[] = [
  "name",
  "total",
  "private",
  "academy",
  "unjustified",
];

/**
 * The filter inputs, held as the raw strings the fields contain.
 *
 * Strings rather than numbers so "cleared" and "zero" stay distinguishable:
 * `maxUnjustified === "0"` means *no unjustified absences at all*, while `""`
 * means the filter is off. Coercing to a number would collapse the two and
 * silently hide every player the moment the coach cleared the field.
 */
export interface PresenceFilters {
  query: string;
  minTotal: string;
  maxUnjustified: string;
}

export const EMPTY_FILTERS: PresenceFilters = {
  query: "",
  minTotal: "",
  maxUnjustified: "",
};

export type SortDirection = "asc" | "desc";

export interface PresenceSort {
  key: PresenceColumnKey;
  direction: SortDirection;
}

/** Web's table default: biggest totals first. */
export const DEFAULT_SORT: PresenceSort = { key: "total", direction: "desc" };

/**
 * How many *numeric* filters are on, for the badge on the filter button.
 *
 * The search box is excluded deliberately: it has its own always-visible field
 * on the screen, so counting it would badge a filter the coach can already see.
 */
export function activeFilterCount(filters: PresenceFilters): number {
  return [filters.minTotal, filters.maxUnjustified].filter(
    (value) => value.trim() !== ""
  ).length;
}

/**
 * Web's predicate, verbatim: name contains the needle, total at least
 * `minTotal`, unjustified at most `maxUnjustified`.
 *
 * A blank bound is ±Infinity rather than 0, so an empty field filters nothing.
 * A bound that is not a number is also treated as absent — a partially typed
 * "-" or "1." must not blank the list mid-keystroke.
 */
export function filterPlayers(
  players: PresencePlayerStats[],
  filters: PresenceFilters
): PresencePlayerStats[] {
  const needle = filters.query.trim().toLowerCase();
  const min = numericBound(filters.minTotal, -Infinity);
  const max = numericBound(filters.maxUnjustified, Infinity);

  return players.filter(
    (player) =>
      player.name.toLowerCase().includes(needle) &&
      player.total >= min &&
      player.unjustified <= max
  );
}

function numericBound(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Sorts a copy. `name` compares with `localeCompare` so accented names order
 * the way a Portuguese coach expects; every other column is a count.
 */
export function sortPlayerStats(
  players: PresencePlayerStats[],
  sort: PresenceSort
): PresencePlayerStats[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
    return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
  });
}

/**
 * Tapping the current sort column flips direction; a new column starts at the
 * direction that column is usually read in — counts biggest-first, names A–Z.
 * Web's `toggleSort`, extracted.
 */
export function nextSort(
  current: PresenceSort,
  key: PresenceColumnKey
): PresenceSort {
  if (key === current.key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key, direction: key === "name" ? "asc" : "desc" };
}

/**
 * Shows or hides a column, keeping the result in `PRESENCE_COLUMNS` order so
 * the CSV header cannot come out in tap order.
 *
 * The pinned column is never removed: hiding it would leave rows of numbers
 * with nothing saying whose they are, and an exported CSV of the same.
 */
export function toggleColumn(
  visible: PresenceColumnKey[],
  key: PresenceColumnKey
): PresenceColumnKey[] {
  if (key === PINNED_COLUMN) return visible;
  const next = visible.includes(key)
    ? visible.filter((k) => k !== key)
    : [...visible, key];
  return PRESENCE_COLUMNS.filter((column) => next.includes(column.key)).map(
    (column) => column.key
  );
}

/** The visible columns as full descriptors, in display order. */
export function visibleColumns(
  visible: PresenceColumnKey[]
): PresenceColumn[] {
  return PRESENCE_COLUMNS.filter((column) => visible.includes(column.key));
}

/**
 * RFC-4180 CSV of exactly what the screen is showing — the visible columns, the
 * filtered rows, in the current sort order. Byte-for-byte the same builder web
 * uses (`PresencePlayersTable.exportCsv`), so the two shells cannot produce
 * files that disagree.
 *
 * Every field is quoted, not just the ones that need it: a coach's name can
 * contain a comma, and the header is translated copy that in Portuguese
 * already does ("Faltas injustificadas" today, something with a comma
 * tomorrow). Embedded quotes are doubled.
 */
export function buildPresencesCsv(
  rows: PresencePlayerStats[],
  columns: PresenceColumn[],
  columnLabel: (key: PresenceColumnKey) => string
): string {
  const header = columns.map((column) => csvField(columnLabel(column.key)));
  const body = rows.map((row) =>
    columns.map((column) => csvField(row[column.key])).join(",")
  );
  return [header.join(","), ...body].join("\n");
}

function csvField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Date-stamped, matching web's `link.download`: a coach exporting monthly ends
 * up with distinct files rather than `presences(3).csv`. On iOS the name is
 * also what the share sheet shows and what Mail attaches, so it has to be
 * meaningful on its own.
 */
export function csvFileName(now: Date): string {
  return `presences-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * "Miguel Ferreira" → "Miguel F." so eight labels fit a phone's axis. Web
 * abbreviates for the same reason at a wider size; a 390pt screen needs it
 * more, not less.
 */
export function abbreviateName(name: string): string {
  const [first = "", last = ""] = name.trim().split(/\s+/);
  return last ? `${first} ${last.charAt(0)}.` : first;
}

/**
 * The per-player bar chart: the busiest players, biggest first.
 *
 * Players with no presences are dropped rather than drawn as zero-height bars —
 * the chart answers "who is turning up", and a roster's worth of empty slots
 * squeezes the answer into the left edge. The table still lists everyone
 * (`attendance.validation` rule 12), so nobody disappears from the screen.
 */
export function topPlayerPoints(
  players: PresencePlayerStats[],
  limit = 8
): ChartPoint[] {
  return [...players]
    .filter((player) => player.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((player) => ({
      label: abbreviateName(player.name),
      fullLabel: player.name,
      value: player.total,
    }));
}

/**
 * The academy/private split. Web draws a donut; the shared `Chart` primitive is
 * deliberately single-series bars/line (see its own note), and two bars of the
 * same measure say the same thing a two-slice pie does without inventing a
 * second encoding or a legend for a 390pt screen.
 */
export function splitPoints(
  totals: PresenceStatsTotals | undefined,
  labels: { private: string; academy: string }
): ChartPoint[] {
  return [
    {
      label: labels.private,
      fullLabel: labels.private,
      value: totals?.private ?? 0,
    },
    {
      label: labels.academy,
      fullLabel: labels.academy,
      value: totals?.academy ?? 0,
    },
  ];
}
