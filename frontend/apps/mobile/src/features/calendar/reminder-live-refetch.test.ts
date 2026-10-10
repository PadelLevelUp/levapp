import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * B-542 / PAD-600 (attendance.confirm rule 27, "The ask reaches an open class detail live").
 * No render harness mounts the class screen, so — as `vou-after-reminder-render.test.ts`
 * does — this reads the screen's source and pins the wiring that regressed: the live handler
 * asks the SHARED predicate before its coach-only gate, and on a match invalidates the
 * class-instance query and the dashboard queries.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = path.join(HERE, "../../../app/class/[id].tsx");
const src = fs.readFileSync(SCREEN, "utf8");

describe("the class screen refetches when the reminder lands (rule 27, B-542)", () => {
  it("uses the shared predicate, ahead of the coach-only gate", () => {
    const predicate = src.indexOf("reminderArrivedFor(");
    const coachGate = src.indexOf("if (!isCoach) return;");
    expect(predicate).toBeGreaterThan(-1);
    expect(coachGate).toBeGreaterThan(-1);
    expect(predicate).toBeLessThan(coachGate);
    expect(src).not.toContain("if (!isCoach || !event) return;");
  });
  it("invalidates the class instance and the dashboard on a match", () => {
    const after = src.slice(src.indexOf("reminderArrivedFor("));
    const block = after.slice(0, after.indexOf("if (!isCoach) return;"));
    expect(block).toContain("queryKeys.classInstance(event)");
    expect(block).toContain('queryKey: ["dashboard"]');
  });
});
