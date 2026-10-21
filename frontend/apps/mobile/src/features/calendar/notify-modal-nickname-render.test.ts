import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-683 (players.nickname rule 9, B-631): the invite picker names a student as the coach does.
 * Source-reading, like class-screen-nickname-render: the modal mounts react-query hooks. */
const MODAL = readFileSync(resolve(__dirname, "notify-modal.tsx"), "utf8");

describe("the invite picker names students as the coach does (PAD-683)", () => {
  it("resolves through the coach's own roster", () => {
    expect(MODAL).toMatch(/coachDisplayName\(allPlayers, playerId, fallback\)/);
  });

  it("group and search rows print the display name, never the raw name", () => {
    expect(MODAL).toMatch(/\{displayName\(player\.id, player\.displayName \?\? player\.name\)\}/);
    expect(MODAL).toMatch(/name: displayName\(p\.playerId, p\.displayName \?\? p\.name\)/);
    expect(MODAL).not.toMatch(/\{player\.name\}/);
  });

  it("the skipped-student toasts name them the same way", () => {
    expect(MODAL.match(/blockedNames\(\w+, displayName\)/g)).toHaveLength(3);
  });
});
