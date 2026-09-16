/**
 * PAD-179 / B-014 — the iOS delete-class dialog's strings live in the SHARED
 * web locale files.
 *
 * `app/class/[id].tsx` renders the delete-scope dialog from
 * `calendar.deleteDialog.*`, and `src/lib/i18n.ts` statically imports
 * `frontend/src/locales/{pt,en}/calendar.json` — the same files the web app
 * uses. When PAD-179 deleted the web-side `DeleteClassDialog.tsx`, those keys
 * looked orphaned on a repo-wide grep of `apps/web`, and removing them as
 * "dead strings" would have silently broken the iOS dialog into raw key paths
 * with nothing failing.
 *
 * This guards that: the keys the iOS screen actually references are read out
 * of the screen source, so a newly-used subkey is covered automatically rather
 * than needing this list kept in sync by hand.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const CLASS_SCREEN = resolve(here, "../../../app/class/[id].tsx");
const LOCALE_DIR = resolve(here, "../../../../../src/locales");

function usedDeleteDialogKeys(): string[] {
  const source = readFileSync(CLASS_SCREEN, "utf8");
  const keys = new Set<string>();
  for (const m of source.matchAll(/calendar\.deleteDialog\.([A-Za-z0-9_]+)/g)) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

function deleteDialogBlock(locale: string): Record<string, unknown> {
  const json = JSON.parse(
    readFileSync(resolve(LOCALE_DIR, locale, "calendar.json"), "utf8"),
  );
  return json?.calendar?.deleteDialog ?? {};
}

describe("iOS delete-class dialog i18n", () => {
  it("the screen still references calendar.deleteDialog keys", () => {
    // Guards the guard: if the screen stops using these keys the assertions
    // below would pass vacuously against an empty set.
    expect(usedDeleteDialogKeys().length).toBeGreaterThan(0);
  });

  it.each(["pt", "en"])(
    "%s defines every calendar.deleteDialog key the iOS screen renders",
    (locale) => {
      const block = deleteDialogBlock(locale);
      for (const key of usedDeleteDialogKeys()) {
        expect(
          block[key],
          `frontend/src/locales/${locale}/calendar.json is missing ` +
            `calendar.deleteDialog.${key}, which app/class/[id].tsx renders — ` +
            `the iOS dialog would show the raw key path`,
        ).toEqual(expect.any(String));
        expect(String(block[key]).trim()).not.toBe("");
      }
    },
  );
});
