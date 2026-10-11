import { isUnderSignupAge } from "@levelup/config";
import { toIso } from "./signup-form";

export type CompleteField = "role" | "birthDate" | "country" | "terms";
export type CompleteErrors = Partial<Record<CompleteField, string>>;

/**
 * auth.social-sign-in rule 4: the completion step's checks, the same rules as sign-up
 * (auth.register rules 3, 18, 19). Values are `auth.signup.*` copy keys; `iso` is the birth date
 * as YYYY-MM-DD when it is valid.
 */
export function validateCompletion(input: {
  birthDate: string;
  country: string;
  termsAccepted: boolean;
}): { errors: CompleteErrors; iso: string | null } {
  const errors: CompleteErrors = {};
  const iso = toIso(input.birthDate);
  if (!input.birthDate) errors.birthDate = "birthDateRequired";
  else if (!iso || new Date(`${iso}T00:00:00`) > new Date()) errors.birthDate = "birthDateInvalid";
  else if (isUnderSignupAge(iso)) errors.birthDate = "birthDateUnderage";
  if (input.country.length !== 2) errors.country = "countryRequired";
  if (!input.termsAccepted) errors.terms = "termsRequired";
  return { errors, iso };
}
