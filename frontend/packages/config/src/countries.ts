/**
 * The countries offered at sign-up (auth.register rule 18).
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

/** Full years on `today` for an ISO `YYYY-MM-DD` birth date; null when unparsable. */
export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
}

/** auth.register rule 18 (PAD-445): LevApp accepts adults only, whatever the country. */
export const MINIMUM_SIGNUP_AGE = 18;

/**
 * Whether sign-up must refuse this birth date. The client's instant feedback on the device's
 * date; the server judges on the UTC date and stays the authority. A malformed or empty date is
 * left to the date checks (false here).
 */
export function isUnderSignupAge(birthDate: string, today: Date = new Date()): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age < MINIMUM_SIGNUP_AGE;
}
