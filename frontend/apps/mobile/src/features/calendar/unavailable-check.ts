/**
 * calendar.student-blockers rule 9 (PAD-107) on the new-class screen
 * (classes.create rule 10, PAD-474), as web's AddClassSheet
 * checkUnavailableThenSave: which chosen students to warn about before saving.
 * An empty answer means "save now". It never blocks: once the coach confirmed,
 * it does not ask again, and a failed lookup saves anyway — the send-time block
 * on the backend is the real guarantee.
 */
export async function unavailableBeforeSave<B>({
  acknowledged,
  playerIds,
  lookup,
}: {
  acknowledged: boolean;
  playerIds: string[];
  lookup: () => Promise<B[]>;
}): Promise<B[]> {
  if (acknowledged || playerIds.length === 0) return [];
  try {
    return await lookup();
  } catch {
    return [];
  }
}
