/** The class edit's participant change (classes.edit rule 9, PAD-474, PAD-842): the ids the coach
 * added and removed, for the `addPlayers` / `removePlayers` keys of `POST /app/edit_class`. One
 * helper for web and iOS. Ids compare as strings: the payload's are numbers and the picker's are
 * strings, so a student unticked and ticked again must cancel out. Web compared them as they came,
 * and sent one student in both lists (PAD-842). */
export function diffParticipants(
  original: readonly { id: string | number }[],
  updated: readonly { id: string | number }[]
): { addPlayers: string[]; removePlayers: string[] } {
  const originalIds = new Set(original.map((p) => String(p.id)));
  const updatedIds = new Set(updated.map((p) => String(p.id)));

  const addPlayers = [...updatedIds].filter((id) => !originalIds.has(id));
  const removePlayers = [...originalIds].filter((id) => !updatedIds.has(id));

  return { addPlayers, removePlayers };
}
