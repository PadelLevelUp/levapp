import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-660 part 2 (players.nickname rule 8): the presences sheet's marking rows (the class card's
 * expanded list and the class detail) print, and label the toggle with, the coach's display name.
 * Source-reading, like clear-mark-render.test.ts: the sheet mounts react-query hooks. */
const SHEET = readFileSync(resolve(__dirname, "ValidateClassesSheet.tsx"), "utf8");

describe("the presences sheet names students as the coach does (PAD-660 rule 8)", () => {
  it("resolves the name once per row list, from the row's player id", () => {
    expect(SHEET).toContain('useCoachDisplayName');
    // the two row lists, plus the walk-in picker (PAD-683: its options print the display name too)
    expect(SHEET.match(/const displayName = useCoachDisplayName\(\)/g)?.length).toBe(3);
  });

  it("prints and labels every row by the display name, never the payload's", () => {
    expect(SHEET.match(/displayName\(player\.playerId, player\.name\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(SHEET).not.toMatch(/\{player\.name\}/);
    expect(SHEET).not.toMatch(/playerName=\{player\.name\}/);
  });
});
