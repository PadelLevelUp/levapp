import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * calendar.event-detail rule 5 (B-240): while the coach edits, the sheet's two
 * counts (capacity card, participants header) read the draft through
 * effectiveFilledSpotsOf, so a declined student the coach unticked is not
 * subtracted. The sheet mounts too much for a render test here; the arithmetic
 * is tested in @levelup/config capacity.test.ts.
 */
const src = readFileSync(join(__dirname, "ClassDetailSheet.tsx"), "utf8");

describe("ClassDetailSheet counts (B-240)", () => {
  it("both counts use effectiveFilledSpotsOf over the active participants, and nothing else counts", () => {
    expect(src.match(/effectiveFilledSpotsOf\(\s*active\.participants,\s*active\.presences\s*\)/g)?.length ?? 0).toBe(2);
    expect(src.match(/effectiveFilledSpots\(/g)).toBeNull();
  });
});
