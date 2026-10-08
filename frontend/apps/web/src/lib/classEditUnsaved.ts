/**
 * classes.edit rule 10 (PAD-525, B-341): whether a class edit in progress has unsaved changes —
 * different from the loaded class BY VALUE, the same comparison the save makes: the fields the
 * save sends, plus the participant diff. An edit typed back to its original value is clean.
 * The class sheet asks "Descartar alterações?" before a close only when this is true.
 */
export function hasUnsavedClassEdit<T extends Record<string, unknown> & { participants?: { id: string }[] }>(
  original: T,
  draft: T,
  fields: readonly (keyof T)[]
): boolean {
  for (const field of fields) {
    if (JSON.stringify(original[field]) !== JSON.stringify(draft[field])) return true;
  }
  const before = new Set((original.participants ?? []).map((p) => p.id));
  const after = new Set((draft.participants ?? []).map((p) => p.id));
  if (before.size !== after.size) return true;
  for (const id of after) if (!before.has(id)) return true;
  return false;
}
