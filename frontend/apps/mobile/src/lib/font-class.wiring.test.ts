import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PAD-156 / compass R-025 — the WIRING guard.
 *
 * `font-class.test.ts` pins what `resolveFontClass` computes. That is not
 * enough: the whole user-visible fix is one call per render path, and deleting
 * any of them leaves the mapping perfectly correct and perfectly unused. The
 * suite has to notice when a weight utility stops being resolved, not only
 * when the resolver stops resolving.
 *
 * Component rendering is out of scope for this project (`vitest.config.ts`
 * aliases `react-native` to a stub, so nothing here can mount a `<Text>`), so
 * the guard reads the sources instead. Coarse, but it fails for exactly the
 * reason R-025 exists: a text render path that writes a weight utility and
 * never resolves it renders Regular on iOS, silently.
 */

const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
const UI_DIR = path.join(MOBILE_ROOT, "src", "components", "ui");

/**
 * The five places app text is rendered (R-025): the `Text` wrapper plus the
 * four `@rn-primitives` components that render a native `Text` without going
 * through it. Every other weight utility in the app sits on a `<Text>` or on a
 * `TextClassContext` value, and is resolved by the wrapper.
 */
const RENDER_PATHS = [
  "text.tsx",
  "label.tsx",
  "dialog.tsx",
  "select.tsx",
  "alert-dialog.tsx",
];

const BARE_WEIGHT = /\bfont-(medium|semibold|bold)\b/;

/**
 * Comments talk about `font-semibold` at length — including in `text.tsx`,
 * which writes no weight utility of its own. Reading prose as a class string
 * would make this pass for the wrong reason.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function readUi(file: string): string {
  return stripComments(fs.readFileSync(path.join(UI_DIR, file), "utf8"));
}

function tsxFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(full);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** True when the file imports react-native's `Text` itself — `TextInput` does not count. */
function importsNativeText(source: string): boolean {
  const clauses = source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g);
  for (const [, clause] of clauses) {
    const imported = clause
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    if (imported.includes("Text")) return true;
  }
  return false;
}

describe("resolveFontClass is wired into every text render path", () => {
  it.each(RENDER_PATHS)(
    "%s resolves its class string if it writes a weight utility",
    (file) => {
      const source = readUi(file);
      if (!BARE_WEIGHT.test(source)) return;

      expect(
        source,
        `${file} writes a bare font weight utility but never calls resolveFontClass(). ` +
          `On iOS that class is inert (R-025) and the text renders Regular.`
      ).toContain("resolveFontClass(");
    }
  );

  it("resolves the class string of every component that renders a native Text", () => {
    const offenders = [...tsxFilesUnder(path.join(MOBILE_ROOT, "src")), ...tsxFilesUnder(path.join(MOBILE_ROOT, "app"))]
      .filter((file) => {
        const source = stripComments(fs.readFileSync(file, "utf8"));
        return importsNativeText(source) && !source.includes("resolveFontClass(");
      })
      .map((file) => path.relative(MOBILE_ROOT, file));

    // `components/ui/text.tsx` holds the app's only react-native `Text` import,
    // and the mapping it applies is what makes every weight utility downstream
    // of it work. Removing that call is invisible to a value-level test.
    expect(offenders).toEqual([]);
  });

  it("runs resolveFontClass after cn(), never inside it", () => {
    // twMerge does not know the custom `font-sans-*` utilities, so resolving
    // first and merging second leaves both the base family and the override in
    // the string, resolved only by NativeWind's last-wins ordering (R-025).
    for (const file of RENDER_PATHS) {
      const source = readUi(file);
      if (!source.includes("resolveFontClass(")) continue;

      expect(source, `${file}: resolveFontClass must wrap cn(), not the other way round`).toMatch(
        /resolveFontClass\(\s*cn\(/
      );
      expect(source, `${file}: cn() must not wrap resolveFontClass()`).not.toMatch(
        /\bcn\(\s*resolveFontClass\(/
      );
    }
  });
});
