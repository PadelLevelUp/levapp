/**
 * PAD-342 (R-013): a role locator's accessible name is rendered copy, so it is
 * resolved from the locale files, never typed.
 *
 *   page.getByRole("button", { name: ui("calendar.detail.delete") })
 *
 * `ui(key)` returns an anchored, case-insensitive RegExp that matches the key's
 * value in BOTH languages (`/^(Delete|Eliminar)$/i`): the seeded E2E users render
 * English (seed.py, PAD-40) while the app's fallback is Portuguese, and a spec must
 * not care which came up. A rename follows the locale file instead of breaking the
 * spec. The rendered-text guard (src/lib/e2e-rendered-text-scan.ts) only ever sees
 * string and regex LITERALS inside `name:`; a call like this is invisible to it by
 * construction, which is what makes the rule mechanical.
 *
 * Keys are `<file>.<path>` exactly as the app's `t()` takes them: `calendar.json`'s
 * `detail.delete` is `"calendar.detail.delete"`. Missing keys throw at test time —
 * a spec must never silently match nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../src/locales");
const LANGS = ["en", "pt"] as const;
export type Lang = (typeof LANGS)[number];

type Dict = Record<string, unknown>;
const cache: Partial<Record<Lang, Dict>> = {};

function load(lang: Lang): Dict {
  const hit = cache[lang];
  if (hit) return hit;
  const dir = join(LOCALES_DIR, lang);
  const tree: Dict = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    // Each file already carries its own top-level key ("calendar": {…}); merge the
    // files into one tree exactly as apps/web/src/i18n.ts does.
    const data = JSON.parse(readFileSync(join(dir, file), "utf8")) as Dict;
    for (const [k, v] of Object.entries(data)) {
      const existing = tree[k];
      tree[k] =
        existing && typeof existing === "object" && v && typeof v === "object" && !Array.isArray(v)
          ? { ...(existing as Dict), ...(v as Dict) }
          : v;
    }
  }
  cache[lang] = tree;
  return tree;
}

/** The raw locale value of `key` in one language; throws when the key is missing. */
export function uiText(key: string, lang: Lang): string {
  let node: unknown = load(lang);
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in (node as Dict))) {
      throw new Error(`e2e i18n: no "${key}" in src/locales/${lang}`);
    }
    node = (node as Dict)[part];
  }
  if (typeof node !== "string") throw new Error(`e2e i18n: "${key}" is not a string in ${lang}`);
  return node;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strip i18next interpolation slots (`{{count}}`) into a wildcard so a value with
 *  a variable still matches whatever the page filled in. */
const withSlots = (s: string): string => escape(s).replace(/\\\{\\\{[^}]+\\\}\\\}/g, ".+?");

/**
 * The accessible name of `key` as rendered in either language. `exact` (default)
 * anchors the whole name; `exact: false` matches it anywhere in the name, for
 * elements whose accessible name has more than the copy (an icon's label, a count).
 */
export function ui(key: string, opts: { exact?: boolean } = {}): RegExp {
  const parts = [...new Set(LANGS.map((lang) => withSlots(uiText(key, lang))))];
  const body = parts.length === 1 ? parts[0] : `(?:${parts.join("|")})`;
  return new RegExp(opts.exact === false ? body : `^${body}$`, "i");
}
