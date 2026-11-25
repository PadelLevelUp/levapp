/**
 * classes.class-requests rule 12 ("Quem vai contigo"): the server answers `DUPLICATE_INVITEE` for a
 * username given twice, compared trimmed and in any letter case (`resolve_participants`). The wizard
 * says the same on the field, before any check: `true` at each index whose name repeats an earlier one.
 * Empty fields never repeat.
 */
export function duplicateInvitees(usernames: ReadonlyArray<string>): boolean[] {
  const seen = new Set<string>();
  return usernames.map((raw) => {
    const key = raw.trim().toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}
