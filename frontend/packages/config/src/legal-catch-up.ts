/**
 * PAD-637 (auth.legal-catch-up): the one screen an older account sees after login when it has no
 * Terms record and/or no birth date. Shared by web (`/legal-catch-up`) and iOS (`legal-catch-up`).
 */
export type LegalPending = { terms: boolean; birthDate: boolean };

type MeLike = { legalPending?: LegalPending | null } | null | undefined;

/** Rule 2: what the screen shows. A server that predates the field means nothing is pending. */
export function legalCatchUpParts(me: MeLike): LegalPending {
  const pending = me?.legalPending;
  return { terms: pending?.terms === true, birthDate: pending?.birthDate === true };
}

/** Rules 2 and 4: open the screen when something is pending and the user has not skipped it this
 * session (the skip lasts the session; it comes back at the next login). */
export function needsLegalCatchUp(me: MeLike, skippedThisSession: boolean): boolean {
  if (skippedThisSession) return false;
  const parts = legalCatchUpParts(me);
  return parts.terms || parts.birthDate;
}

// Rule 4: "Agora não" lasts the session. Held in memory, as the email prompt's dismissal
// (auth.email-verification rule 14): a reload, a relaunch or a sign-out starts a new session.
let skippedFor: string | null = null;

export const legalCatchUpSession = {
  skip(userId: number | string): void {
    skippedFor = String(userId);
  },
  isSkipped(userId: number | string | null | undefined): boolean {
    return userId != null && skippedFor === String(userId);
  },
  /** Called on sign-out: the next sign-in asks again. */
  reset(): void {
    skippedFor = null;
  },
};
