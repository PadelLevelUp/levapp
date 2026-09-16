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
  /** `text` (PAD-320's matchers, the default), `role` (PAD-342: a typed role name) or
   *  `alternation` (PAD-322: a bilingual `/delete|eliminar/i` with a locale half). */
  kind?: "text" | "role" | "alternation";
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
export function localeValues(
  tree: unknown,
  out: Set<string> = new Set(),
  minLength = 3,
): Set<string> {
  if (typeof tree === "string") {
    const v = norm(tree);
    if (v.length >= minLength) out.add(v);
  } else if (Array.isArray(tree)) {
    for (const v of tree) localeValues(v, out, minLength);
  } else if (tree && typeof tree === "object") {
    for (const v of Object.values(tree)) localeValues(v, out, minLength);
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
 * Text matchers only. `getByRole(…, { name })` is scanned separately by
 * `scanRoleNames` (PAD-342, R-013 as amended): a role's accessible name IS rendered
 * copy and breaks the same way, but it is a different debt with its own backlog, so
 * the two counts never move each other.
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

/**
 * PAD-342 — role locators whose accessible name is TYPED rather than resolved.
 *
 * R-013 (as amended) keeps `getByRole` at the top of the order only when the name
 * comes from the locale files: `name: ui("calendar.detail.delete")`. That shape is a
 * call, so it never matches the two patterns below — the guard tells "resolved" from
 * "typed" by construction, not by allowlist. What IS matched: a string literal or a
 * regex literal inside `name:`, on the same line or the next. A literal that resolves
 * to no locale value is test data (a class title) and is left alone; a bilingual
 * alternation is PAD-322's and is classified `bilingual`, not counted.
 */
const PW_ROLE_LITERAL =
  /getByRole\(\s*["'][a-z]+["']\s*,\s*\{[^}]*?\bname:\s*(["'`])(.+?)\1/gs;
const PW_ROLE_REGEX =
  /getByRole\(\s*["'][a-z]+["']\s*,\s*\{[^}]*?\bname:\s*\/([^/\n]{2,})\/[a-z]*/gs;

/** The copy inside a role-name regex: anchors, a wrapping group and `.*` stripped. */
export const roleRegexCore = (re: string): string =>
  re
    .replace(/^\^/, "")
    .replace(/\$$/, "")
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\.\*/, "")
    .replace(/\.\*$/, "")
    .replace(/\\([.?!()])/g, "$1");

/** Typed role names in one Playwright spec (same `file` naming as `scanPlaywright`). */
export function scanRoleNames(file: string, source: string, locales: Locales): Violation[] {
  const found: Violation[] = [];
  for (const m of source.matchAll(PW_ROLE_LITERAL)) {
    const literal = m[2];
    if (literal.length < 2 || !/[A-Za-z]/.test(literal)) continue;
    const bucket = classify(file, literal, locales);
    if ((CONVERTIBLE as readonly string[]).includes(bucket)) {
      found.push({ file, literal, bucket, kind: "role" });
    }
  }
  for (const m of source.matchAll(PW_ROLE_REGEX)) {
    const raw = m[1];
    if (raw.includes("|")) continue; // bilingual alternation: PAD-322
    const core = roleRegexCore(raw);
    if (!/[A-Za-z]/.test(core)) continue;
    const bucket = classify(file, core, locales);
    if ((CONVERTIBLE as readonly string[]).includes(bucket)) {
      found.push({ file, literal: core, bucket, kind: "role" });
    }
  }
  return found;
}

/**
 * PAD-322 — bilingual alternations. `/delete|eliminar/i` was somebody's workaround
 * for exactly the problem PAD-320 fixes: it survives a language switch, so it never
 * made the suite order-dependent, but it still breaks on a rename. It is counted here
 * when at least one half resolves to a locale value — that is what makes it copy and
 * not test data (`/I1\s*\|\s*Intermediate/` has an ESCAPED bar and is not an
 * alternation; `/create.*invite|invite.*player/i` resolves to nothing and is left).
 * The fix is the same resolved shape as a role name: `ui("common.delete")` as the
 * matcher's argument, which the scanner cannot see. Scanned across the text
 * matchers and role names alike, so a text slice and a role slice never move it.
 */
const PW_ALT = new RegExp(
  String.raw`(getByText|getByPlaceholder|getByLabel|toContainText|toHaveText|hasText|\bname)\s*[:(]?\s*\/((?:[^/\\\n]|\\.)*[^\\]\|(?:[^/\\\n]|\\.)*)\/[a-z]*`,
  "gs",
);

/** The halves of an alternation regex, each cleaned like a role-name regex. */
export const alternationHalves = (raw: string): string[] => {
  const outer = raw.replace(/^\^/, "").replace(/\$$/, "").replace(/^\((.*)\)$/, "$1");
  return outer
    .split(/(?<!\\)\|/)
    .map((h) => roleRegexCore(h.trim()))
    .filter((h) => /[A-Za-z]/.test(h));
};

/** Bilingual alternations with a locale half, in one Playwright spec. */
export function scanAlternations(file: string, source: string, locales: Locales): Violation[] {
  const found: Violation[] = [];
  for (const m of source.matchAll(PW_ALT)) {
    const halves = alternationHalves(m[2]);
    if (halves.length < 2) continue;
    const resolved = halves.some((h) => {
      const core = norm(h);
      return locales.en.has(core) || locales.pt.has(core);
    });
    if (!resolved) continue;
    if (SUBJECT_RE.test(file) || file in SUBJECT_ALLOWLIST) continue;
    found.push({ file, literal: m[2], bucket: "bilingual", kind: "alternation" });
  }
  return found;
}
