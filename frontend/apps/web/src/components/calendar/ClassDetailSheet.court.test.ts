import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * clubs.courts rule 9 (PAD-513): one occurrence of a series may have its own
 * court, so the editor keeps offering the Court select in every scope and the
 * save keeps sending `courtId` — "this occurrence only" included, and a class
 * that does not recur saves with scope "single" too. The sheet mounts too much
 * for a render test here (see ClassDetailSheet.count.test.ts); the server side
 * is test_pad513_occurrence_court.py.
 */
const src = readFileSync(join(__dirname, "ClassDetailSheet.tsx"), "utf8");

describe("ClassDetailSheet court wiring (PAD-513)", () => {
  it("courtId is an editable field, diffed into the changes every scope saves", () => {
    const fields = src.match(/const EDITABLE_FIELDS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    expect(fields).toContain('"courtId"');
    expect(src).toMatch(/const changes = diffInstance\(classInstance, draft, EDITABLE_FIELDS\);/);
    expect(src).toMatch(/commitEdit\("single"\)/);
  });

  it("the Court select is gated on editing and on the club having courts, never on the scope", () => {
    const gate = src.match(/\{(isEditing && courts\.length > 0) \? \(/)?.[1];
    expect(gate).toBe("isEditing && courts.length > 0");
    expect(src).toContain('data-testid="class-detail-court"');
  });
});
