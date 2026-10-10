import type { StateTone } from "./attendance-state";
import type {
  AbsenceJustification,
  PendingValidationPlayer,
  PresenceResponse,
  PresenceStatus,
} from "@levelup/types";

/**
 * PAD-140 — the three states a coach can record, flattened.
 *
 * Lives in `packages/config` because BOTH shells record attendance: the web
 * Presences tab and class-detail sheet, and the mobile equivalents. Keeping the
 * mapping here is what stops the two platforms drifting on what "justified"
 * means — they may differ in presentation, never in this.
 *
 * The backend stores this as two columns (`status` + `justification`); the UI
 * reads better as one three-way choice. This module owns the mapping in both
 * directions so the Presences tab and the class-detail sheet can never drift
 * apart on what "justified" means.
 */
export type PresenceMark = "present" | "justified" | "unjustified";

export function toMark(
  status: PresenceStatus | null,
  justification: AbsenceJustification | null
): PresenceMark | null {
  if (status === "present") return "present";
  if (status === "absent") {
    // An absence with no justification recorded yet is treated as unjustified,
    // matching `AttendanceRow`'s default in the class-detail sheet.
    return justification === "justified" ? "justified" : "unjustified";
  }
  return null;
}

export function fromMark(mark: PresenceMark): {
  status: PresenceStatus;
  justification?: AbsenceJustification;
} {
  if (mark === "present") return { status: "present" };
  return {
    status: "absent",
    justification: mark === "justified" ? "justified" : "unjustified",
  };
}

/**
 * The default the coach sees before touching anything (prototype parity).
 *
 * `confirmed` → present, `declined` → justified, `none` → undecided. Note the
 * second one is a policy choice, not a mechanical mapping: a self-declared
 * absence is assumed excused until the coach says otherwise, and
 * `unjustified_absences` feeds the eligibility bar, so this default is the
 * generous one. It is deliberately only a *display* default — nothing is
 * persisted until the coach validates the class.
 */
export function prefillMark(response: PresenceResponse): PresenceMark | null {
  if (response === "confirmed") return "present";
  if (response === "declined") return "justified";
  return null;
}

/**
 * What a player's row should show right now: an explicit local edit if the
 * coach made one, else whatever is already stored, else the prefill.
 */
export function effectiveMark(
  player: PendingValidationPlayer,
  edit: PresenceMark | null | undefined
): PresenceMark | null {
  // PAD-567 (attendance.validation rule 26): an explicit `null` edit is a CLEARED mark —
  // the coach pressed the selected state again — and reads as undecided, whatever is
  // stored. `undefined` is "no edit": fall back to the stored mark, then the prefill.
  if (edit === null) return null;
  if (edit) return edit;
  return toMark(player.status, player.justification) ?? prefillMark(player.response);
}

/**
 * PAD-567: the rows a class-detail save must send as `{playerId, clear: true}` — those
 * with a mark on the SERVER whose local state the coach cleared (`status: null`).
 * `absencesOnly` narrows to the cleared absences, the ones that take a seat back and may
 * put the class over capacity (rule 26's warning).
 */
export function clearsFor(
  server: ReadonlyArray<{ playerId: string | number; status?: PresenceStatus | null }>,
  local: Record<string, { status: PresenceStatus | null } | undefined>,
  opts: { absencesOnly?: boolean } = {}
): string[] {
  return server
    .filter((row) => (opts.absencesOnly ? row.status === "absent" : row.status != null))
    .map((row) => String(row.playerId))
    .filter((id) => local[id] !== undefined && local[id]?.status === null);
}

/**
 * PAD-538 (attendance.validation rule 27): how many players the class has as present right now —
 * the same mark each row shows (`effectiveMark`: the coach's local mark, else what is stored,
 * else the prefill). It moves as the coach marks; on a validated class it is the recorded number.
 */
export function presentCount(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark | null>
): number {
  return players.filter((p) => effectiveMark(p, edits[p.playerId]) === "present").length;
}

/** A class can be validated once every player has a determination. */
export function undecidedCount(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark | null>
): number {
  return players.filter((p) => effectiveMark(p, edits[p.playerId]) === null).length;
}

/**
 * attendance.validation rule 25 (PAD-442): which group a class sits in comes from the server's
 * state only — no local marks — so a class the coach completes stays where it was (with its
 * Validate button available, which follows the marks) until the queue is next loaded.
 */
export function validationGroup(
  players: PendingValidationPlayer[]
): "needsInput" | "ready" {
  return undecidedCount(players, {}) > 0 ? "needsInput" : "ready";
}

/**
 * attendance.validation rule 26 / attendance.absences rule 14 (PAD-441): the tone of a chosen
 * mark, the one mapping both shells colour a selected option and a justification badge with.
 */
export function presenceMarkTone(mark: PresenceMark): StateTone {
  switch (mark) {
    case "present":
      return "positive";
    case "justified":
      return "warning";
    case "unjustified":
      return "negative";
  }
}
