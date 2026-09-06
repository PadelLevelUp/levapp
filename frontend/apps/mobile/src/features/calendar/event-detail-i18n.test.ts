import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "./event-draft";

/**
 * Every `t()` key the event-detail screen renders must resolve to a STRING in
 * both `pt` and `en` (PAD-160).
 *
 * The first attempt at this screen shipped `t("calendar.scope.delete")`, which
 * is an OBJECT — `calendar.scope.delete.title`, `.singleTitle` and friends, the
 * shape `ClassScopeDialog` consumes. i18next without `returnObjects` hands back
 * the key path, so the delete button rendered the literal text
 * "calendar.scope.delete". Nothing caught it: `tsc` types `t()` as returning a
 * string, and no mobile test opens a locale file.
 *
 * This reads the screen's source and resolves each key against the locale trees
 * built exactly the way `src/lib/i18n.ts` builds them — same namespace list,
 * same deep merge — so a key that is missing, misspelled, present in only one
 * language, or an object rather than a leaf fails here instead of on a device.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const I18N_MODULE = path.join(MOBILE_ROOT, "src/lib/i18n.ts");
const SCREEN = path.join(MOBILE_ROOT, "app/event/[id].tsx");

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
 * The namespace files for a language, taken from `i18n.ts`'s own static
 * imports rather than from a directory listing: the app only ships what that
 * module imports, so a locale file nobody wired up must not make this pass.
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

function capitalize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Keys the screen renders through a child component rather than through its
 * own `t()`. `<ClassScopeDialog mode="delete">` builds
 * `calendar.scope.delete.<field>` — the very family the object bug came from.
 */
const KEYS_FROM_CHILDREN = [
  "title",
  "description",
  "singleTitle",
  "singleDescription",
  "futureTitle",
  "futureDescription",
].map((field) => `calendar.scope.delete.${field}`);

/** Literal and template `t()` keys in a source file, templates expanded. */
function translationKeys(source: string): string[] {
  const keys = new Set<string>();
  // `t(` then a quoted literal — allowing the newline the multi-line calls use.
  const calls = source.matchAll(/\bt\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g);
  for (const [, , raw] of calls) {
    if (!raw.includes("${")) {
      keys.add(raw);
      continue;
    }
    // The only interpolation the screen uses is the block-type suffix. Anything
    // else is a key this check cannot resolve, and silently skipping it is how
    // the previous "all keys verified" claim came to be false.
    const typeSuffix = raw.match(/^(.*)\$\{capitalize\([^)]*\)\}$/);
    expect(typeSuffix, `unhandled dynamic translation key: ${raw}`).not.toBeNull();
    for (const blockType of BLOCK_TYPES) {
      keys.add(`${typeSuffix![1]}${capitalize(blockType)}`);
    }
  }
  return [...keys];
}

function resolve(tree: Dict, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Dict)[part]
          : undefined,
      tree
    );
}

describe("event-detail screen translation keys", () => {
  const keys = [...translationKeys(fs.readFileSync(SCREEN, "utf8")), ...KEYS_FROM_CHILDREN];

  it("finds the screen's keys at all", () => {
    // A regex that matched nothing would make every assertion below vacuous.
    expect(keys.length).toBeGreaterThan(20);
    expect(keys).toContain("calendar.eventDetail.title");
    expect(keys).toContain("calendar.eventDetail.typeOffWork");
  });

  for (const language of ["en", "pt"] as const) {
    it(`resolves every key to a string in ${language}`, () => {
      const tree = localeTree(language);
      const broken = keys
        .map((key) => ({ key, value: resolve(tree, key) }))
        .filter(({ value }) => typeof value !== "string")
        .map(
          ({ key, value }) =>
            `${key} -> ${value === undefined ? "MISSING" : typeof value}`
        );
      expect(broken, `${language} keys that do not resolve to a string`).toEqual(
        []
      );
    });
  }
});
