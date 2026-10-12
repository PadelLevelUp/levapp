import { isUnderSignupAge, type LegalPending } from "@levelup/config";
import { toIso } from "./signup-form";

/**
 * PAD-637 (auth.legal-catch-up): the iOS catch-up screen's checks, kept pure so the mobile runner can
 * pin them. The birth date is typed DD/MM/AAAA, as on sign-up and activation.
 */
export type LegalCatchUpInput = { termsAccepted: boolean; birthDate: string };
export type LegalCatchUpErrorCode = "termsRequired" | "birthDateRequired" | "underage";

/** Rules 3 and 5: each pending part is required; under 18 is refused before anything is sent. */
export function legalCatchUpErrors(
  pending: LegalPending,
  input: LegalCatchUpInput
): Partial<Record<"terms" | "birthDate", LegalCatchUpErrorCode>> {
  const errors: Partial<Record<"terms" | "birthDate", LegalCatchUpErrorCode>> = {};
  if (pending.terms && !input.termsAccepted) errors.terms = "termsRequired";
  if (pending.birthDate) {
    const iso = toIso(input.birthDate);
    if (!iso) errors.birthDate = "birthDateRequired";
    else if (isUnderSignupAge(iso)) errors.birthDate = "underage";
  }
  return errors;
}

/** Rule 3: the body sends only what is pending. */
export function legalCatchUpBody(pending: LegalPending, input: LegalCatchUpInput) {
  return {
    ...(pending.terms ? { termsAccepted: true } : {}),
    ...(pending.birthDate ? { birthDate: toIso(input.birthDate) ?? "" } : {}),
  };
}
