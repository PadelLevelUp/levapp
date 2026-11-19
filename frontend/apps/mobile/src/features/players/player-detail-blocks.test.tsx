/**
 * players.profile rules 4 and 10-12 (PAD-834): the player screen's header carries four actions and
 * the three blocks follow it in order, stacked. The screen (app/, react-query, expo-router) is
 * outside the unit harness, so its structure is pinned by reading its source; each block is
 * mounted in its own test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
const at = (needle: string) => {
  const i = screen.indexOf(needle);
  expect(i, needle).toBeGreaterThanOrEqual(0);
  return i;
};

describe("the player screen (PAD-834)", () => {
  it("[PLAYERS-PROFILE-10] the header carries four actions in order", () => {
    const order = [
      'testID="player-add-to-classes"',
      'testID="player-waiting-list',
      'testID="player-edit"',
      'testID="player-remove"',
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const gone of ["player-attendance-link", "player-absences-link", "player-evaluations-action"]) {
      expect(screen).not.toContain(`testID="${gone}"`);
    }
  });

  it("[PLAYERS-PROFILE-21] the blocks render in order, left column first", () => {
    const order = ["<PlayerStateAlerts", "<PlayerInfoBlock", "<EvaluationsBlock", "<AttendanceBlock", "<StrengthsWeaknesses"].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The header actions sit above the scrolled blocks.
    expect(at('testID="player-remove"')).toBeLessThan(at("ref={scrollRef}"));
  });
});
