/**
 * PAD-660 (`players.nickname` rule 3): the name a coach's view shows for a student.
 *
 * A coach can give a student a private nickname and show it as the name. The server sends it only
 * on the REQUESTING coach's own roster rows (`displayName`, `nickname`, `nicknameAsName`; `name`
 * stays the real name). A shared payload — the class detail, which any coach of the club can read
 * — never carries it, so a coach view resolves the name here, from that coach's roster, instead of
 * reading `player.user.name`. A student's own views never call this.
 */

type RosterRowLike = {
  playerId?: string | number | null;
  name?: string | null;
  nickname?: string | null;
  nicknameAsName?: boolean | null;
  displayName?: string | null;
};

/** The roster row's display name for this player, else the fallback (the real name). */
export function coachDisplayName(
  roster: ReadonlyArray<RosterRowLike> | null | undefined,
  playerId: string | number | null | undefined,
  fallbackName: string | null | undefined
): string {
  if (playerId != null && roster) {
    const row = roster.find((r) => r.playerId != null && String(r.playerId) === String(playerId));
    if (row?.displayName) return row.displayName;
  }
  return fallbackName ?? "";
}

/** True when this row shows a nickname in place of the name (then the real name goes under it). */
export function nicknameShown(row: RosterRowLike | null | undefined): boolean {
  return !!row && row.nicknameAsName === true && !!row.nickname && row.nickname.trim() !== "";
}
