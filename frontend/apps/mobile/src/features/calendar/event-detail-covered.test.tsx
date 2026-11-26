/**
 * calendar.student-blockers rules 19-21, criterion -28 (PAD-772) on iOS: the calendar's block screen
 * (`app/event/[id].tsx`) saves through `PUT /calendar_block/{id}` and, like the availability tab, asks after
 * a save whose answer carries `coveredClasses`. The screen is read as source (the repo's way of proving an
 * `app/` file's wiring, as `settings-sections.test.ts` does); what the dialog does with an answer is proved
 * by `features/availability/blocker-covered.test.tsx` and the shared decision's own test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(path.resolve(HERE, "../../../app/event/[id].tsx"), "utf8");

describe("a blocker edited from the calendar's block screen (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar asks after the save", () => {
    // The hook is used, its dialog is rendered, and the save's answer is handed to it once the edit succeeded.
    expect(SCREEN).toMatch(/useBlockerCoveredFollowUp\(\)/);
    expect(SCREEN).toMatch(/\{covered\.dialog\}/);
    const save = SCREEN.slice(SCREEN.indexOf("const handleSave"), SCREEN.indexOf("const handleDelete"));
    expect(save).toMatch(/updated = \(await editEvent\.mutateAsync\(/);
    // A failed save returns before the question: the dialog follows a saved block only.
    expect(save.indexOf("failedUpdateEvent")).toBeLessThan(save.indexOf("covered.follow(updated)"));
    expect(save).toMatch(/return;\s*\}\s*\/\/[^\n]*\n\s*await covered\.follow\(updated\)/);
  });
});
