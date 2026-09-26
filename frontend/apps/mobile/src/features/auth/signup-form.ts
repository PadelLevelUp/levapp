/**
 * The iOS sign-up form's pure rules, out of app/signup.tsx so they can be unit-tested (PAD-445):
 * the birth-date input format, the schema (auth.register rules 2–4, 18), and the server's error
 * codes in the form's words.
 */
import { z } from "zod";
import { isUnderSignupAge } from "@levelup/config";

/**
 * auth.parental-consent rule 10 (PAD-198): the birth date is typed as
 * DD/MM/AAAA with the number pad — the wheel picker opens on today, which is
 * slow for a date years back and cannot be driven by Maestro.
 */
export function formatBirthInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** DD/MM/AAAA → YYYY-MM-DD for a real calendar date; null otherwise. */
export function toIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** auth.register rule 18: the server's codes, in the form's own words. */
export const CODE_KEYS: Record<string, string> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateInvalid",
  COUNTRY_REQUIRED: "countryRequired",
  INVALID_COUNTRY: "countryRequired",
  UNDERAGE: "birthDateUnderage",
};

/** Same rules as web's SignUpPage (auth.register rules 2–4). */
export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "nameMin"),
    username: z
      .string()
      .trim()
      .min(3, "usernameMin")
      .max(80, "usernameMax")
      .regex(/^[A-Za-z0-9._-]+$/, "usernameChars")
      .refine((u) => !u.toLowerCase().startsWith("pending-"), "usernameReserved"),
    email: z.string().trim().email("emailInvalid"),
    password: z.string().min(8, "passwordMin"),
    repeatPassword: z.string(),
    birthDate: z.string(),
    country: z.string().length(2, "countryRequired"),
  })
  .refine((d) => d.password === d.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  })
  .superRefine((d, ctx) => {
    const iso = toIso(d.birthDate);
    if (!d.birthDate) {
      ctx.addIssue({ code: "custom", message: "birthDateRequired", path: ["birthDate"] });
      return;
    }
    if (!iso || new Date(`${iso}T00:00:00`) > new Date()) {
      ctx.addIssue({ code: "custom", message: "birthDateInvalid", path: ["birthDate"] });
      return;
    }
    // auth.register rule 18 (PAD-445): adults only.
    if (isUnderSignupAge(iso)) {
      ctx.addIssue({ code: "custom", message: "birthDateUnderage", path: ["birthDate"] });
      return;
    }
  });
