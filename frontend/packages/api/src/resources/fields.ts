import { getApi } from "../client";

/**
 * B-102 / players.duplicate-name-check rule 7. `check_field_available` answers
 * a conflict with 409 and English prose in `message`. The client knows which
 * (model, field) pairs it checks, so it maps each to a reason and renders the
 * reason's locale key; the server text is only a fallback for a pair it does
 * not know.
 */
export type FieldConflictReason = "username_taken" | "email_taken" | "duplicate_name";

export const FIELD_CONFLICT_KEYS: Record<FieldConflictReason, string> = {
  username_taken: "common.fieldConflict.username_taken",
  email_taken: "common.fieldConflict.email_taken",
  duplicate_name: "common.fieldConflict.duplicate_name",
};

const REASONS: Record<string, FieldConflictReason> = {
  "user.username": "username_taken",
  "user.email": "email_taken",
  "user.name": "duplicate_name",
};

export function fieldConflictReason(model: string, field: string): FieldConflictReason | null {
  return REASONS[`${model}.${field}`] ?? null;
}

export interface FieldConflict {
  /** null for a pair the client has no reason for; render `message` then. */
  reason: FieldConflictReason | null;
  /** The server's text, kept as the fallback. */
  message: string;
}

/** The conflict for `value`, or null when it is available (or the check failed). */
export async function checkFieldConflict(
  model: string,
  field: string,
  value: string,
  // PAD-17: optional coach id used to scope warn-only checks (e.g. the player
  // name duplicate warning) to the requesting coach's own roster. Unique-field
  // checks (username/email) ignore it and stay global on the backend.
  scope?: string | number | null,
): Promise<FieldConflict | null> {
  try {
    await getApi().post("/app/check_field_available", {
      model,
      field,
      value,
      ...(scope != null && scope !== "" ? { scope } : {}),
    });
    return null;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      return { reason: fieldConflictReason(model, field), message: err.response.data.message };
    }
    return null;
  }
}

/** The server's message for a conflict, or null. Unchanged contract; prefer `checkFieldConflict`. */
export async function checkFieldAvailable(
  model: string,
  field: string,
  value: string,
  scope?: string | number | null,
): Promise<string | null> {
  return (await checkFieldConflict(model, field, value, scope))?.message ?? null;
}

/** What to show for a conflict: the reason's locale key, else the server's text. */
export function fieldConflictText(conflict: FieldConflict | null, t: (key: string) => string): string | null {
  if (!conflict) return null;
  return conflict.reason ? t(FIELD_CONFLICT_KEYS[conflict.reason]) : conflict.message;
}
