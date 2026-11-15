/**
 * PAD-837 (attendance.validation rule 17c): the Presences players table's columns, once.
 *
 * Web's table and chooser, iOS's list and columns sheet, and both CSVs read this list; before it
 * each shell declared the same eight ids itself. The display order is the list's order: the coach
 * chooses which columns show, never where.
 */

/** What a column's cells hold: the player's name, a number of classes, or (PAD-837) minutes. */
export type PresenceColumnUnit = "name" | "count" | "minutes";

/** Every column, in display order. `name` is pinned and never hidden. */
export const PRESENCE_COLUMNS = [
  { key: "name", numeric: false, unit: "name", defaultVisible: true },
  { key: "total", numeric: true, unit: "count", defaultVisible: true },
  { key: "private", numeric: true, unit: "count", defaultVisible: true },
  { key: "academy", numeric: true, unit: "count", defaultVisible: true },
  { key: "justified", numeric: true, unit: "count", defaultVisible: false },
  { key: "unjustified", numeric: true, unit: "count", defaultVisible: true },
  { key: "invitesReceived", numeric: true, unit: "count", defaultVisible: false },
  { key: "invitesJoined", numeric: true, unit: "count", defaultVisible: false },
] as const satisfies readonly {
  key: string;
  numeric: boolean;
  unit: PresenceColumnUnit;
  defaultVisible: boolean;
}[];

export type PresenceColumn = (typeof PRESENCE_COLUMNS)[number];
export type PresenceColumnKey = PresenceColumn["key"];

/** The pinned column: every other cell is a statement *about* this one. */
export const PINNED_COLUMN: PresenceColumnKey = "name";

/** The columns a coach sees before choosing any, in display order. */
export const DEFAULT_VISIBLE_COLUMNS: PresenceColumnKey[] = PRESENCE_COLUMNS.filter(
  (column) => column.defaultVisible
).map((column) => column.key);

/**
 * Shows or hides a column, keeping the result in `PRESENCE_COLUMNS` order so the CSV header
 * cannot come out in tap order.
 *
 * The pinned column is never removed: hiding it would leave rows of numbers with nothing saying
 * whose they are, and an exported CSV of the same.
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
export function visibleColumns(visible: PresenceColumnKey[]): PresenceColumn[] {
  return PRESENCE_COLUMNS.filter((column) => visible.includes(column.key));
}

/**
 * The columns to show for a saved view (settings.coach-presences-view rule 3), whatever was
 * stored: the server checks the shape, not the ids, so the list is the judge here.
 *
 * An id the list does not know is ignored (a column retired since the save); `name` is shown
 * whether or not it was stored; the order is the list's, never the stored one; a stored empty
 * list is `name` alone. Anything that is not `{columns: string[]}` (null: never saved, or a load
 * that failed) is the defaults.
 */
export function resolvePresencesView(stored: unknown): PresenceColumnKey[] {
  const columns = (stored as { columns?: unknown } | null | undefined)?.columns;
  if (!Array.isArray(columns)) return DEFAULT_VISIBLE_COLUMNS;
  return PRESENCE_COLUMNS.filter(
    (column) => column.key === PINNED_COLUMN || columns.includes(column.key)
  ).map((column) => column.key);
}
