import type {
  AbsenceJustification,
  PendingValidationPlayer,
  PresenceResponse,
  PresenceStatus,
} from "@/types";

/**
 * PAD-140 — the three states a coach can record, flattened.
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
  edit: PresenceMark | undefined
): PresenceMark | null {
  if (edit) return edit;
  return toMark(player.status, player.justification) ?? prefillMark(player.response);
}

/** A class can be validated once every player has a determination. */
export function undecidedCount(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark>
): number {
  return players.filter((p) => effectiveMark(p, edits[p.playerId]) === null).length;
}
