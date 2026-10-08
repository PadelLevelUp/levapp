import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-539 (attendance.validation rule 18, B-342) on iOS: the Presences trigger's number is the
 * coach's whole backlog (`pendingTotal`), with the shown week's count under it. No render
 * harness on mobile (the screen mounts react-query hooks), so this reads the screen's source
 * the way `edit-leave-asks.test.ts` does, and checks the copy exists in both languages.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const SCREEN = fs.readFileSync(path.join(MOBILE_ROOT, "src/features/presences/PresencesScreen.tsx"), "utf8");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

describe("the Presences trigger shows the backlog (PAD-539)", () => {
  it("renders the total as its number and the week's share under it", () => {
    expect(SCREEN).toMatch(/const pendingTotal = pendingCountQuery\.data\?\.pendingTotal/);
    expect(SCREEN).toMatch(/t\("presences\.validate\.trigger", \{ count: pendingTotal \}\)/);
    expect(SCREEN).toMatch(/testID="presences-validate-week"/);
    expect(SCREEN).toMatch(/"presences\.validate\.triggerWeekShown", \{ count: pendingCount \}/);
    // The week's count is never the trigger's number any more.
    expect(SCREEN).not.toMatch(/t\("presences\.validate\.trigger", \{ count: pendingCount \}\)/);
  });

  it("has the week line copy in both languages", () => {
    for (const lng of ["pt", "en"]) {
      const dict = JSON.parse(fs.readFileSync(path.join(LOCALES, lng, "presences.json"), "utf8")) as {
        presences: { validate: Record<string, string> };
      };
      for (const key of ["triggerWeek_one", "triggerWeek_other", "triggerWeekEmpty", "triggerWeekShown_one", "triggerWeekShown_other", "triggerWeekShownEmpty"]) {
        expect(dict.presences.validate[key], `${lng}.${key}`).toBeTruthy();
      }
    }
  });
});
