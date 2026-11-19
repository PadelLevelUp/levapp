/**
 * PAD-837 (attendance.validation rule 17c): the Presences players table's columns, once.
 *
 * Web's table and chooser, iOS's list and columns sheet, and both CSVs read this list; before it
 * each shell declared the same eight ids itself. The display order is the list's order: the coach
 * chooses which columns show, never where.
 */

import { formatBalanceHours, formatMinutesAsHours } from "./presence-hours";
import type { PresencePeriodShortcut } from "./presence-periods";

/** What a column's cells hold: the player's name, a number of classes, or (PAD-837) minutes. */
export type PresenceColumnUnit = "name" | "count" | "minutes";

/** Every column, in display order. `name` is pinned and never hidden. */
export const PRESENCE_COLUMNS = [
  { key: "name", numeric: false, unit: "name", defaultVisible: true },
  { key: "total", numeric: true, unit: "count", defaultVisible: true },
  // PAD-837 (rule 17d): each hours twin sits right after its count column; hidden by default.
  { key: "presenceMinutes", numeric: true, unit: "minutes", defaultVisible: false },
  { key: "private", numeric: true, unit: "count", defaultVisible: true },
  { key: "academy", numeric: true, unit: "count", defaultVisible: true },
  { key: "justified", numeric: true, unit: "count", defaultVisible: false },
  { key: "justifiedMinutes", numeric: true, unit: "minutes", defaultVisible: false },
  { key: "unjustified", numeric: true, unit: "count", defaultVisible: true },
  { key: "invitesReceived", numeric: true, unit: "count", defaultVisible: false },
  { key: "invitesJoined", numeric: true, unit: "count", defaultVisible: false },
  { key: "guestPresenceMinutes", numeric: true, unit: "minutes", defaultVisible: false },
  // "Saldo de horas": guest presence minus justified absence, computed on the server (Q2).
  { key: "balanceMinutes", numeric: true, unit: "minutes", defaultVisible: false },
] as const satisfies readonly {
  key: string;
  numeric: boolean;
  unit: PresenceColumnUnit;
  defaultVisible: boolean;
}[];

export type PresenceColumn = (typeof PRESENCE_COLUMNS)[number];
export type PresenceColumnKey = PresenceColumn["key"];

/**
 * The columns that carry a help line (attendance.validation rule 17e): the two guest columns, whose
 * names alone do not say that the first counts every guest appearance, whatever the answer, and the
 * second only those where the student was present. Each shell shows `presences.columnHelp.<id>`.
 */
export const HELPED_COLUMNS: PresenceColumnKey[] = ["invitesReceived", "invitesJoined"];

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
  // A copy: the caller owns what it is handed, and the defaults must not change under it.
  if (!Array.isArray(columns)) return [...DEFAULT_VISIBLE_COLUMNS];
  return PRESENCE_COLUMNS.filter(
    (column) => column.key === PINNED_COLUMN || columns.includes(column.key)
  ).map((column) => column.key);
}

/** The default period a coach can save (attendance.validation rule 17f): every shortcut. */
export const DEFAULT_PERIOD_CHOICES: readonly PresencePeriodShortcut[] = [
  "thisWeek",
  "thisMonth",
  "lastMonth",
  "season",
];

/** "Este mês" until the coach makes another shortcut their default (Q5, decided 2026-11-15). */
export const FALLBACK_DEFAULT_PERIOD: PresencePeriodShortcut = "thisMonth";

/**
 * The coach's default period from a saved view (settings.coach-presences-view rule 3): the stored
 * `defaultPeriod` when it is one of the shortcuts, otherwise "thisMonth" (never saved, an older
 * view with columns only, a value a later release retired, or a load that failed).
 */
export function resolveDefaultPeriod(stored: unknown): PresencePeriodShortcut {
  const period = (stored as { defaultPeriod?: unknown } | null | undefined)?.defaultPeriod;
  return DEFAULT_PERIOD_CHOICES.includes(period as PresencePeriodShortcut)
    ? (period as PresencePeriodShortcut)
    : FALLBACK_DEFAULT_PERIOD;
}

/** The number behind a cell: a stats row read by its column id (the ids are the wire's). */
export function presenceCellValue(
  row: Partial<Record<PresenceColumnKey, unknown>>,
  key: Exclude<PresenceColumnKey, "name">
): number {
  const value = row[key];
  return typeof value === "number" ? value : 0;
}

/**
 * The text of a numeric cell, on screen and in the CSV alike (attendance.validation rules 17,
 * 17d): a count as is, minutes through the one formatter, the balance with its sign. A missing
 * value (a server without the field yet) is 0.
 */
export function presenceCellText(
  row: Partial<Record<PresenceColumnKey, unknown>>,
  key: Exclude<PresenceColumnKey, "name">
): string {
  const value = presenceCellValue(row, key);
  if (key === "balanceMinutes") return formatBalanceHours(value);
  const column = PRESENCE_COLUMNS.find((c) => c.key === key);
  return column?.unit === "minutes" ? formatMinutesAsHours(value) : String(value);
}
