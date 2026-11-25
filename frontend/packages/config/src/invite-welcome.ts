/**
 * auth.invite-welcome: two points that wait for the owner (asked 2026-11-25), built on the stream lead's pick
 * behind one constant each, shared by web and iOS. The other answer is a one-line change here.
 *
 * (a) A student's invite page names the coach and the club before sign-in: yes. The page shows them only when the
 *     public preview carries them (the preview does not, until a backend change lands: players.invite-completion).
 * (b) The two invite pages say "tu", not "você" (Portuguese; English is unchanged): yes.
 */
export const INVITE_NAMES_INVITER = true;
export const INVITE_PAGES_TU = true;

/** The coach's and the club's name from a player-invitation preview, or nothing. */
export function invitePreviewNames(
  preview: { coachName?: string | null; clubName?: string | null },
  show: boolean = INVITE_NAMES_INVITER
): { coach: string; club: string } | undefined {
  if (!show || !preview.coachName || !preview.clubName) return undefined;
  return { coach: preview.coachName, club: preview.clubName };
}

/** The translation key a page reads for a line the "tu" answer rewrites: `<key>Tu` in Portuguese, else the key. */
export function inviteCopyKey(key: string, language: string, tu: boolean = INVITE_PAGES_TU): string {
  return tu && language.toLowerCase().startsWith("pt") ? `${key}Tu` : key;
}
