import { isUnderSignupAge } from "./countries";

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

/** auth.register rule 18's refusal codes, as the catch-up screen's message keys (`auth.legalCatchUp.*`). */
export const LEGAL_CATCH_UP_BIRTH_DATE_KEYS: Record<string, "birthDateRequired" | "underage"> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateRequired",
  UNDERAGE: "underage",
};

export type LegalCatchUpErrorCode = "termsRequired" | "birthDateRequired" | "underage";

/** Rules 3 and 5: each pending part is required; under 18 is refused before anything is sent.
 * `birthDateIso` is `YYYY-MM-DD`, or null when what was typed is not a real date. */
export function legalCatchUpErrors(
  pending: LegalPending,
  input: { termsAccepted: boolean; birthDateIso: string | null }
): Partial<Record<"terms" | "birthDate", LegalCatchUpErrorCode>> {
  const errors: Partial<Record<"terms" | "birthDate", LegalCatchUpErrorCode>> = {};
  if (pending.terms && !input.termsAccepted) errors.terms = "termsRequired";
  if (pending.birthDate) {
    const iso = input.birthDateIso;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) errors.birthDate = "birthDateRequired";
    else if (isUnderSignupAge(iso)) errors.birthDate = "underage";
  }
  return errors;
}

/** Rule 3: the body sends only what is pending. */
export function legalCatchUpBody(pending: LegalPending, input: { birthDateIso: string | null }) {
  return {
    ...(pending.terms ? { termsAccepted: true } : {}),
    ...(pending.birthDate ? { birthDate: input.birthDateIso ?? "" } : {}),
  };
}
