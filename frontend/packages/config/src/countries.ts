/**
 * auth.parental-consent (PAD-198) — the countries offered at sign-up.
 *
 * `consentAge` mirrors the backend's seed of `digital_consent_ages` so the form
 * can show the guardian-email field before submitting. The server stays the
 * authority: an operator may change an age in the database without a release,
 * and a 400 `GUARDIAN_EMAIL_REQUIRED` then reveals the field anyway.
 * `ZZ` ("another country") has no row server-side and uses the default, 16.
 */
export type Country = { code: string; pt: string; en: string; consentAge: number };

export const DEFAULT_CONSENT_AGE = 16;

export const COUNTRIES: Country[] = [
  { code: "PT", pt: "Portugal", en: "Portugal", consentAge: 13 },
  { code: "ES", pt: "Espanha", en: "Spain", consentAge: 14 },
  { code: "FR", pt: "França", en: "France", consentAge: 15 },
  { code: "IT", pt: "Itália", en: "Italy", consentAge: 14 },
  { code: "DE", pt: "Alemanha", en: "Germany", consentAge: 16 },
  { code: "GB", pt: "Reino Unido", en: "United Kingdom", consentAge: 13 },
  { code: "IE", pt: "Irlanda", en: "Ireland", consentAge: 16 },
  { code: "NL", pt: "Países Baixos", en: "Netherlands", consentAge: 16 },
  { code: "BE", pt: "Bélgica", en: "Belgium", consentAge: 13 },
  { code: "US", pt: "Estados Unidos", en: "United States", consentAge: 13 },
  { code: "BR", pt: "Brasil", en: "Brazil", consentAge: DEFAULT_CONSENT_AGE },
  { code: "AO", pt: "Angola", en: "Angola", consentAge: DEFAULT_CONSENT_AGE },
  { code: "MZ", pt: "Moçambique", en: "Mozambique", consentAge: DEFAULT_CONSENT_AGE },
  { code: "CV", pt: "Cabo Verde", en: "Cape Verde", consentAge: DEFAULT_CONSENT_AGE },
  { code: "CH", pt: "Suíça", en: "Switzerland", consentAge: DEFAULT_CONSENT_AGE },
  { code: "LU", pt: "Luxemburgo", en: "Luxembourg", consentAge: DEFAULT_CONSENT_AGE },
  { code: "ZZ", pt: "Outro país", en: "Another country", consentAge: DEFAULT_CONSENT_AGE },
];

export function countryName(code: string, language: string): string {
  const c = COUNTRIES.find((x) => x.code === code);
  if (!c) return code;
  return language.startsWith("en") ? c.en : c.pt;
}

export function consentAgeFor(code: string): number {
  return COUNTRIES.find((x) => x.code === code)?.consentAge ?? DEFAULT_CONSENT_AGE;
}

/** Full years on `today` for an ISO `YYYY-MM-DD` birth date; null when unparsable. */
export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
}

/** Whether the form should ask for a guardian's email (the server decides for real). */
export function needsGuardian(birthDate: string, country: string, today: Date = new Date()): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age >= 0 && age < consentAgeFor(country);
}
