/**
 * calendar.student-blockers rules 19-21 and 26, criteria -28 and -32 (PAD-772, owner correction 26 Nov 2026) on
 * iOS: the calendar's block screen (`app/event/[id].tsx`) saves through `PUT /calendar_block/{id}` and, like the
 * availability tab, says how many classes the save marked and asks nothing; a student's blocker form carries the
 * static line. The screen is read as source (the repo's way of proving an `app/` file's wiring, as
 * `settings-sections.test.ts` does); what the hook does with an answer is proved by
 * `features/availability/blocker-covered.test.tsx` and the shared decision's own test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(path.resolve(HERE, "../../../app/event/[id].tsx"), "utf8");

describe("a blocker edited from the calendar's block screen (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar says how many were marked", () => {
    // The hook is used, no dialog is rendered, and the save's answer is handed to it once the edit succeeded.
    expect(SCREEN).toMatch(/useBlockerSaveFollowUp\(\)/);
    expect(SCREEN).not.toMatch(/covered\.dialog|useBlockerCoveredFollowUp|decline_covered|declineCovered/);
    const save = SCREEN.slice(SCREEN.indexOf("const handleSave"), SCREEN.indexOf("const handleDelete"));
    expect(save).toMatch(/updated = \(await editEvent\.mutateAsync\(/);
    // A failed save returns before the line: it follows a saved block only.
    expect(save.indexOf("failedUpdateEvent")).toBeLessThan(save.indexOf("afterSave(updated)"));
    expect(save).toMatch(/return;\s*\}\s*\/\/[^\n]*\n\s*afterSave\(updated\)/);
  });

  it("[CALENDAR-STUDENT-BLOCKERS-32] a student's blocker form says classes in the period are marked, above the save button", () => {
    const notice = SCREEN.indexOf('testID="blocker-covered-notice"');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(SCREEN.indexOf('testID="event-detail-save"'));
    // Only for a student's blocker (type unavailable), never a coach's own block.
    expect(SCREEN.slice(notice - 200, notice)).toMatch(/block\?\.type === "unavailable"/);
    expect(SCREEN).toMatch(/availability\.covered\.notice/);
  });
});
