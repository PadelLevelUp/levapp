import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-538 (attendance.validation rule 27) on iOS: the validate sheet shows each class's present
 * count from the shared `presentCount`, on the card, the validated row and the drill-in title.
 * No render harness for the sheet's hooks, so this reads the source and the copy; the count
 * itself is unit-tested in `@levelup/config` (presence-status.test.ts).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const SHEET = fs.readFileSync(path.join(MOBILE_ROOT, "src/features/presences/ValidateClassesSheet.tsx"), "utf8");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

describe("the iOS validate sheet shows how many are present (PAD-538)", () => {
  it("renders the shared count, under the shared test id, in three places", () => {
    expect(SHEET).toMatch(/presentCount\(players, edits\)/);
    expect(SHEET).toMatch(/testID="presences-class-present-count"/);
    expect(SHEET.match(/<PresentCount /g)?.length).toBe(3);
  });

  it("has the copy in both languages, zero included", () => {
    for (const lng of ["pt", "en"]) {
      const v = (JSON.parse(fs.readFileSync(path.join(LOCALES, lng, "presences.json"), "utf8")) as {
        presences: { validate: Record<string, string> };
      }).presences.validate;
      for (const key of ["presentCount_one", "presentCount_other", "presentCountNone"]) {
        expect(v[key], `${lng}.${key}`).toBeTruthy();
      }
    }
  });
});
