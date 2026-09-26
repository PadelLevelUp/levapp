/**
 * classes.join-requests rule 17 (PAD-460): the coach's "Pedidos de Aula" and the
 * student's Availability requests list show private `ClassRequest` rows
 * (classes.class-requests) beside academy `ClassJoinRequestListRow` rows
 * (`GET /app/class-join-requests`), merged into ONE newest-first list and split
 * into the same open / closed sections. Pure so both shells (web and iOS, whose
 * unit runner cannot mount a component) share one sort/split rule instead of
 * two that could drift apart.
 */
import type { ClassJoinRequestListRow, ClassRequest } from "@levelup/types";

export type MergedClassRequestRow = ({ kind: "private" } & ClassRequest) | ClassJoinRequestListRow;

// A private request is open while the coach or the student still owes an
// answer (`pending` | `countered`); an academy request is open only while it
// is `pending` — there is no counter-proposal on it (rule 17).
const PRIVATE_OPEN_STATUSES = new Set<ClassRequest["status"]>(["pending", "countered"]);

export function isOpenClassRequestRow(row: MergedClassRequestRow): boolean {
  return row.kind === "academy" ? row.status === "pending" : PRIVATE_OPEN_STATUSES.has(row.status);
}

/** Newest first by `createdAt` (both kinds carry it); ties keep their input order. */
export function mergeClassRequestRows(
  privateRows: ClassRequest[],
  academyRows: ClassJoinRequestListRow[]
): MergedClassRequestRow[] {
  const tagged: MergedClassRequestRow[] = [
    ...privateRows.map((r) => ({ kind: "private" as const, ...r })),
    ...academyRows,
  ];
  return tagged.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Rule 17: the merged list split into the section that awaits an answer and the rest. */
export function splitClassRequestRows(rows: MergedClassRequestRow[]): {
  open: MergedClassRequestRow[];
  closed: MergedClassRequestRow[];
} {
  const open: MergedClassRequestRow[] = [];
  const closed: MergedClassRequestRow[] = [];
  for (const row of rows) (isOpenClassRequestRow(row) ? open : closed).push(row);
  return { open, closed };
}
