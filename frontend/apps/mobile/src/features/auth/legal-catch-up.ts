import {
  legalCatchUpBody as sharedBody,
  legalCatchUpErrors as sharedErrors,
  type LegalPending,
} from "@levelup/config";
import { toIso } from "./signup-form";

/**
 * PAD-637 (auth.legal-catch-up): the iOS screen types the birth date DD/MM/AAAA, as on sign-up and
 * activation; the checks themselves are the shared ones in `@levelup/config` (web uses them too).
 */
export type LegalCatchUpInput = { termsAccepted: boolean; birthDate: string };

export function legalCatchUpErrors(pending: LegalPending, input: LegalCatchUpInput) {
  return sharedErrors(pending, { termsAccepted: input.termsAccepted, birthDateIso: toIso(input.birthDate) });
}

export function legalCatchUpBody(pending: LegalPending, input: LegalCatchUpInput) {
  return sharedBody(pending, { birthDateIso: toIso(input.birthDate) });
}
