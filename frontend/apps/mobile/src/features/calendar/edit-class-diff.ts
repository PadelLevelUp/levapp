import type { ClassInstance } from "@levelup/types";

/** Fields the edit-class UI is allowed to change, diffed against the
 * original instance to build the `updates` payload for `useEditClass`.
 * Mirrors web's EDITABLE_FIELDS (ClassDetailSheet.tsx). */
export const EDITABLE_CLASS_FIELDS = [
  "name",
  "date",
  "startTime",
  "endTime",
  "color",
  "maxPlayers",
  "levelId",
  "courtId",
  "recurrenceEnd",
  "notificationsEnabled",
  // PAD-129: the eligibility tier this screen addresses (null / [] / rules).
  "eligibilityRules",
  // PAD-130: the open-spot toggle at this tier (null / true / false).
  "openSpotsVisible",
  // PAD-429 (notifications.toggle-class rule 7): the auto-invites tri-state
  // at this tier (null / true / false).
  "autoInvites",
] as const satisfies readonly (keyof ClassInstance)[];

/** Generic before/after diff for scalar/object/array fields — values are
 * compared via JSON.stringify so nested fields (e.g. recurrenceRule) are
 * caught too. Ports web's ClassDetailSheet.tsx diffInstance.
 *
 * Constrained to `object` rather than `Record<string, unknown>`: indexing
 * is done via `keyof T`, which works on any object type regardless of an
 * index signature, so `Record<string, unknown>` was an unnecessarily strict
 * constraint — plain interfaces like ClassInstance (no index signature)
 * don't structurally satisfy it and would need a cast at every call site. */
export function diffInstance<T extends object>(
  original: T,
  updated: T,
  fields: readonly (keyof T)[]
): Partial<T> {
  const diff: Partial<T> = {};
  for (const field of fields) {
    if (JSON.stringify(original[field]) !== JSON.stringify(updated[field])) {
      diff[field] = updated[field];
    }
  }
  return diff;
}

/** Diffs two participant lists down to id sets for the addPlayers/removePlayers
 * edit-class payload keys. Ports web's ClassDetailSheet.tsx diffParticipants.
 * Ids compare as strings (PAD-474): the API serialises a participant id as a
 * number and the picker hands back a string, so unticking and re-ticking a
 * student must cancel out. */
export function diffParticipants(
  original: { id: string }[],
  updated: { id: string }[]
): { addPlayers: string[]; removePlayers: string[] } {
  const originalIds = new Set(original.map((p) => String(p.id)));
  const updatedIds = new Set(updated.map((p) => String(p.id)));

  const addPlayers = [...updatedIds].filter((id) => !originalIds.has(id));
  const removePlayers = [...originalIds].filter((id) => !updatedIds.has(id));

  return { addPlayers, removePlayers };
}


/** The edit screen's change set: the field diff plus the participant diff
 * (classes.edit rule 9, PAD-474). Web's commitEdit builds both before deciding
 * there is nothing to save; diffing the fields alone dropped an edit that only
 * added or removed students. */
export function buildClassEditChanges<T extends { participants?: { id: string }[] }>(
  original: T,
  updated: T
): Record<string, unknown> {
  const changes = diffInstance(
    original,
    updated,
    EDITABLE_CLASS_FIELDS as unknown as (keyof T)[]
  ) as Record<string, unknown>;
  const { addPlayers, removePlayers } = diffParticipants(
    original.participants ?? [],
    updated.participants ?? []
  );
  if (addPlayers.length > 0) changes.addPlayers = addPlayers;
  if (removePlayers.length > 0) changes.removePlayers = removePlayers;
  return changes;
}
