/**
 * PAD-320 — the scanner behind the rendered-text guard.
 *
 * An E2E assertion that matches on rendered copy breaks when the copy changes and,
 * worse, passes or fails depending on which language the page came up in. The web
 * app renders pt and the mobile app renders en (see the E2E notes), so an assertion
 * on visible text is a coin toss dressed as a check.
 *
 * Every literal found in the two test trees is resolved against the app's OWN locale
 * values, in both languages, which is what distinguishes translatable UI copy from
 * test-created data. `classify` is pure — it takes the locale sets rather than reading
 * them — so the scanner can be tested against inline sources with a known answer.
 * Nothing here reads the filesystem; `collectViolations` takes file contents.
 */

export type Bucket = "en" | "pt" | "both" | "bilingual" | "subject" | "data";

/** Buckets that are defects under PAD-320. Everything else is deliberately out. */
export const CONVERTIBLE: readonly Bucket[] = ["en", "pt", "both"] as const;

export interface Violation {
  file: string;
  literal: string;
  bucket: Bucket;
}

export interface Locales {
  en: Set<string>;
  pt: Set<string>;
}

/**
 * Per-FILE allowlist: the file's subject IS the text, so asserting on it is the
 * point of the test rather than a defect. Never "any pt literal" — a blanket
 * language exemption would swallow real violations in the same file.
 */
export const SUBJECT_ALLOWLIST: Record<string, string> = {
  "mz:flows/14-student-calendar.yaml":
    "asserts the student's own state word; en is correct because the seeded account is en",
};

const SUBJECT_RE = /i18n|language|locale/i;

export const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Collect every string value in a nested locale JSON object. */
export function localeValues(tree: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof tree === "string") {
    const v = norm(tree);
    if (v.length >= 3) out.add(v);
  } else if (Array.isArray(tree)) {
    for (const v of tree) localeValues(v, out);
  } else if (tree && typeof tree === "object") {
    for (const v of Object.values(tree)) localeValues(v, out);
  }
  return out;
}

/**
 * Which bucket a single literal falls in. `alternation` marks the bilingual
 * `/delete|eliminar/i` shape, which is OUT of PAD-320 by decision: it survives a
 * language switch, so it can neither make the suite order-dependent nor pass while
 * the feature is broken. It is classified rather than ignored so the decision stays
 * visible in the counts.
 */
export function classify(file: string, literal: string, locales: Locales, alternation = false): Bucket {
  if (alternation) return "bilingual";
  const core = norm(literal.replace(/^\.\*/, "").replace(/\.\*$/, ""));
  const inEn = locales.en.has(core);
  const inPt = locales.pt.has(core);
  if (!inEn && !inPt) return "data";
  if (SUBJECT_RE.test(file) || file in SUBJECT_ALLOWLIST) return "subject";
  if (inEn && inPt) return "both";
  return inEn ? "en" : "pt";
}

/**
 * Text matchers only. `getByRole(…, { name })` is deliberately NOT here: a role's
 * accessible name IS rendered copy and breaks the same way, but R-013 tells people to
 * prefer role locators over text ones, so criminalising 182 of them is a change to
 * R-013 rather than a conversion. That argument is PAD-342; until it is settled, a
 * role-name locator is not a violation here.
 *
 * Both forms of literal are matched. An earlier count classified regex literals only
 * when they contained an alternation, which quietly measured "assertions written with
 * quotes" instead of "assertions on rendered text" — a 4x undercount.
 */
const PW_LITERAL =
  /(getByText|getByPlaceholder|getByLabel|toContainText|toHaveText|hasText)\s*[:(]?\s*(["'])(.+?)\2/gs;
const PW_REGEX = /(getByText|toContainText|hasText)\s*[:(]?\s*\/([^/\n]{4,})\//gs;
const MZ_LITERAL =
  /^[ \t]*(?:-[ \t]*)?(?:text|assertVisible|assertNotVisible):[ \t]*["']?([^"'\n]{3,})["']?[ \t]*$/gm;

/** Violations in one Playwright spec. `file` is the display name, e.g. `pw:auth/login.spec.ts`. */
export function scanPlaywright(file: string, source: string, locales: Locales): Violation[] {
  const found: Violation[] = [];
  for (const m of source.matchAll(PW_LITERAL)) {
    const literal = m[3];
    if (literal.length < 3 || !/[A-Za-z]/.test(literal) || literal.includes("|")) continue;
    const bucket = classify(file, literal, locales);
    if ((CONVERTIBLE as readonly string[]).includes(bucket)) found.push({ file, literal, bucket });
  }
  for (const m of source.matchAll(PW_REGEX)) {
    if (m[2].includes("|")) continue; // bilingual alternation: out by decision
    const bucket = classify(file, m[2], locales);
    if ((CONVERTIBLE as readonly string[]).includes(bucket)) found.push({ file, literal: m[2], bucket });
  }
  return found;
}

/** Violations in one Maestro flow. `file` is the display name, e.g. `mz:flows/04-attendance.yaml`. */
export function scanMaestro(file: string, source: string, locales: Locales): Violation[] {
  const found: Violation[] = [];
  for (const m of source.matchAll(MZ_LITERAL)) {
    const literal = m[1].trim();
    if (!/[A-Za-z]/.test(literal) || literal.includes("${") || literal.startsWith("id:")) continue;
    const bucket = classify(file, literal, locales, literal.includes("|"));
    if ((CONVERTIBLE as readonly string[]).includes(bucket)) found.push({ file, literal, bucket });
  }
  return found;
}
