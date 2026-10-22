
/**
 * PAD-660 (`players.nickname` rule 3): the name a coach's view shows for a student.
 *
 * A coach can give a student a private nickname and show it as the name. The server sends it only
 * on the REQUESTING coach's own roster rows (`displayName`, `nickname`, `nicknameAsName`; `name`
 * stays the real name). A shared payload — the class detail, which any coach of the club can read
 * — never carries it, so a coach view resolves the name here, from that coach's roster, instead of
 * reading `player.user.name`. A student's own views never call this.
 */

/** The longest nickname the server accepts (players.nickname rule 6; NICKNAME_MAX server-side). */
export const NICKNAME_MAX = 60;

type RosterRowLike = {
  playerId?: string | number | null;
  userId?: string | number | null;
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

/**
 * PAD-683 (players.nickname rule 9b): the same, for a payload that names a person by their USER
 * id (the messageable list, whose public shape rule 15 pins): the coach's roster row for that user.
 */
export function coachDisplayNameByUserId(
  roster: ReadonlyArray<RosterRowLike> | null | undefined,
  userId: string | number | null | undefined,
  fallbackName: string | null | undefined
): string {
  if (userId != null && roster) {
    const row = roster.find((r) => r.userId != null && String(r.userId) === String(userId));
    if (row?.displayName) return row.displayName;
  }
  return fallbackName ?? "";
}

/** True when this row shows a nickname in place of the name (then the real name goes under it). */
export function nicknameShown(row: RosterRowLike | null | undefined): boolean {
  return !!row && row.nicknameAsName === true && !!row.nickname && row.nickname.trim() !== "";
}

/**
 * PAD-660 (players.nickname rule 5): the coach's nickname for this row, as the shared search rule's
 * `nickname` field (players.search rule 4), so a picker finds a student by either name. A roster
 * row carries `nickname`; a row built from a display name alone (a picker's candidates) passes it
 * when it differs from the real name. Null when there is none: the real name only.
 */
export function rosterNicknameOf(row: {
  name?: string | null;
  nickname?: string | null;
  displayName?: string | null;
}): string | null {
  if (row.nickname && row.nickname.trim()) return row.nickname;
  return row.displayName && row.displayName !== row.name ? row.displayName : null;
}
