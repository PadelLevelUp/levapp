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

describe("the Maestro proof flows follow the screen (PAD-834)", () => {
  const flow = (name: string) =>
    fs.readFileSync(path.resolve(here, "../../../.maestro/flows", name), "utf8");

  it("101 asserts the four header actions and the blocks, never the links that left the header", () => {
    const f = flow("101-player-detail-action-row.yaml");
    for (const id of ["player-add-to-classes", "player-waiting-list", "player-edit", "player-remove",
      "player-info-card", "evaluation-card", "profile-attendance-block"]) {
      expect(f).toContain(`id: "${id}"`);
    }
    expect(f).not.toMatch(/assertVisible:\s*\n\s*id: "player-(attendance-link|absences-link|evaluations-action)"/);
  });

  it("82 and 280 edit through Block 1, and 34 expects the cancel-invite mode on the placeholder", () => {
    for (const name of ["82-clear-player-notes.yaml", "280-level-select-scrolls.yaml"]) {
      const f = flow(name);
      expect(f).toContain('id: "player-info-edit"');
      expect(f).not.toContain('id: "player-edit"');
    }
    expect(flow("34-player-removal.yaml")).toContain('id: "player-remove-mode-cancel-invite"');
  });

  it("333-336 are PAD-834's, listed in config.yaml, and clean up the placeholder they create", () => {
    const config = fs.readFileSync(path.resolve(here, "../../../.maestro/config.yaml"), "utf8");
    for (const name of ["333-player-needs-configuring", "334-player-pending-registration",
      "335-player-attendance-block", "336-players-list-pending-filter"]) {
      expect(config).toContain(`- ${name}`);
      const f = flow(`${name}.yaml`);
      if (name.startsWith("335")) continue;
      expect(f).toContain("pad834-setup.js");
      expect(f).toContain("pad834-teardown.js");
    }
    expect(flow("334-player-pending-registration.yaml")).toContain('id: "player-copy-invite-link"');
    expect(flow("336-players-list-pending-filter.yaml")).toContain('id: "players-alert-pending"');
  });
});
