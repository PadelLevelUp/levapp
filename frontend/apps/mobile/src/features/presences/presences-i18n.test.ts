import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every `t()` key the Presences tab renders must resolve to a STRING in both
 * `pt` and `en` (PAD-185).
 *
 * PAD-185 wired 20-odd `presences.validate.*` keys that only the web dialog had
 * ever rendered. Mobile i18n is static-import (`src/lib/i18n.ts` names each
 * namespace by hand) and no mobile test renders a screen, so a key that is
 * missing, misspelled, present in one language only, or an OBJECT rather than a
 * leaf shows up as the raw key path on a device and nowhere else. `tsc` types
 * `t()` as returning `string`, so it sees nothing either.
 *
 * Modelled on `features/calendar/event-detail-i18n.test.ts`, which exists
 * because exactly that happened once (PAD-160).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const I18N_MODULE = path.join(MOBILE_ROOT, "src/lib/i18n.ts");

const SOURCES = [
  "src/features/presences/ValidateClassesSheet.tsx",
  "src/features/presences/PresenceMarkToggle.tsx",
  "src/features/presences/PresencesScreen.tsx",
].map((rel) => path.join(MOBILE_ROOT, rel));

type Dict = Record<string, unknown>;

/** `src/lib/i18n.ts`'s deepMerge, kept behaviourally identical. */
function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge({ ...(tv as Dict) }, sv as Dict);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

/**
 * The namespace files for a language, taken from `i18n.ts`'s own static imports
 * rather than from a directory listing: the app only ships what that module
 * imports, so a locale file nobody wired up must not make this pass.
 */
function localeTree(language: "en" | "pt"): Dict {
  const source = fs.readFileSync(I18N_MODULE, "utf8");
  const i18nDir = path.dirname(I18N_MODULE);
  const pattern = new RegExp(
    `from "([^"]*/locales/${language}/[^"]+\\.json)"`,
    "g"
  );
  const files = [...source.matchAll(pattern)].map((m) =>
    path.resolve(i18nDir, m[1])
  );
  expect(
    files.length,
    `no ${language} namespaces found in ${I18N_MODULE}`
  ).toBeGreaterThan(5);
  return files.reduce<Dict>(
    (acc, file) => deepMerge(acc, JSON.parse(fs.readFileSync(file, "utf8"))),
    {}
  );
}

/**
 * The suffixes every `${…}` template key in these files can take.
 *
 * Listed by hand, not inferred: the point is to fail when a new branch is added
 * without its strings, and a regex that derived the branches from the same
 * source it is checking would always agree with itself.
 */
const TEMPLATE_SUFFIXES: Record<string, string[]> = {
  "presences.validate.group.": ["needsInput", "ready"],
  "presences.type.": ["academy", "private"],
  "presences.response.": ["confirmed", "declined", "none"],
  "presences.mark.short.": ["present", "justified", "unjustified"],
  "presences.column.": ["private", "academy", "unjustified", "invitesJoined"],
};

/** Literal and template `t()` keys in a source file, templates expanded. */
function translationKeys(source: string): string[] {
  const keys = new Set<string>();
  const calls = source.matchAll(/\bt\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g);
  for (const [, , raw] of calls) {
    if (!raw.includes("${")) {
      keys.add(raw);
      continue;
    }
    const prefix = raw.slice(0, raw.indexOf("${"));
    const suffixes = TEMPLATE_SUFFIXES[prefix];
    // Silently skipping an unrecognised template is how a suite comes to claim
    // "all keys verified" while verifying none of the interesting ones.
    expect(suffixes, `unhandled dynamic translation key: ${raw}`).toBeDefined();
    for (const suffix of suffixes!) keys.add(`${prefix}${suffix}`);
  }
  return [...keys];
}

function resolve(tree: Dict, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Dict)[part] : undefined,
      tree
    );
}

/**
 * A counted key lives in the JSON as `<key>_one` / `<key>_other`, never as
 * `<key>` — i18next picks the CLDR category at call time. Both plural forms
 * must exist or one count renders the raw key path.
 */
function resolvesToString(tree: Dict, key: string): boolean {
  if (typeof resolve(tree, key) === "string") return true;
  return (
    typeof resolve(tree, `${key}_one`) === "string" &&
    typeof resolve(tree, `${key}_other`) === "string"
  );
}

describe("presences translation keys", () => {
  const keys = [
    ...new Set(
      SOURCES.flatMap((file) =>
        translationKeys(fs.readFileSync(file, "utf8"))
      )
    ),
  ];

  it("finds the tab's keys at all", () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(keys.length).toBeGreaterThan(30);
    expect(keys).toContain("presences.validate.title");
  });

  it("renders the validate-flow keys PAD-185 brought over from web", () => {
    // The gap the ticket named, pinned so a refactor cannot quietly drop the
    // depth back to "validate or don't".
    for (const key of [
      "presences.validate.statusFor",
      "presences.validate.edit",
      "presences.validate.open",
      "presences.validate.back",
      "presences.validate.readyBanner",
      "presences.validate.validateClass",
      "presences.validate.saveChanges",
      "presences.validate.undoValidation",
      "presences.validate.addPlayer",
      "presences.validate.choosePlayer",
      "presences.validate.lastMinute",
      "presences.validate.selectClass",
      "presences.validate.selectReady",
      "presences.validate.validateSelected",
      "presences.validate.clear",
      "presences.validate.skipped",
    ]) {
      expect(keys, `${key} is no longer rendered by the Presences tab`).toContain(
        key
      );
    }
  });

  for (const language of ["en", "pt"] as const) {
    it(`resolves every key to a string in ${language}`, () => {
      const tree = localeTree(language);
      const broken = keys
        .filter((key) => !resolvesToString(tree, key))
        .map((key) => {
          const value = resolve(tree, key);
          return `${key} -> ${value === undefined ? "MISSING" : typeof value}`;
        });
      expect(broken, `${language} keys that do not resolve to a string`).toEqual(
        []
      );
    });
  }
});
