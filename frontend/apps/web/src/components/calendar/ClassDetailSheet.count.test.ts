import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * calendar.event-detail rule 5 (B-240): while the coach edits, the sheet's two
 * counts (capacity card, participants header) read the draft through
 * effectiveFilledSpotsOf, so a declined student the coach unticked is not
 * subtracted. The sheet mounts too much for a render test here; the arithmetic
 * is tested in @levelup/config capacity.test.ts.
 */
const SHEET = path.join(path.dirname(fileURLToPath(import.meta.url)), "ClassDetailSheet.tsx");
const src = fs.readFileSync(SHEET, "utf8");

describe("ClassDetailSheet counts (B-240)", () => {
  it("both counts use effectiveFilledSpotsOf over the active participants", () => {
    expect(src.match(/effectiveFilledSpotsOf\(\s*active\.participants,\s*active\.presences\s*\)/g)?.length ?? 0).toBe(2);
  });

  it("no count subtracts saved declines from a bare participants length", () => {
    expect(src).not.toMatch(/effectiveFilledSpots\(\s*active\.participants\.length/);
  });
});
