import { describe, expect, it } from "vitest";
import type { CourtDiagramV1, CourtDiagramV2, Piece } from "@levelup/types";
import {
  COURT_COLORS,
  GAME_START_POSITION,
  LOB_BOW,
  NET_Y,
  SERVICE_LINES_Y,
  VIEW_H,
  VIEW_W,
  ballPathD,
  ballPathMidpoint,
  hitTestPiece,
  legacyToPercent,
  lobControlPoint,
  nearestPlayer,
  newDiagram,
  toPercent,
  toView,
  upgradeCourtDiagram,
  interpolateStep,
  piecesAtStep,
  positionAfterStep,
} from "./court-diagram";

// The legacy fixture from training.tactical-board — "Legacy diagram is upgraded on read".
const LEGACY: CourtDiagramV1 = {
  elements: [
    { id: "e1", type: "player_1", x: 80, y: 140 },
    { id: "e2", type: "player_3", x: 80, y: 380 },
    { id: "e3", type: "coach", x: 140, y: 260 },
    { id: "e4", type: "blocker", x: 100, y: 100 },
    { id: "e5", type: "arrow", x: 80, y: 140, endX: 80, endY: 380, curve: 30 },
  ],
};

function player(pieces: Piece[], label: string) {
  const p = pieces.find((x) => x.kind === "player" && x.label === label);
  if (!p || p.kind !== "player") throw new Error(`no player ${label}`);
  return p;
}

describe("court geometry (training.tactical-board rule 5/6)", () => {
  it("is a 340:600 portrait court with the canvas line positions", () => {
    expect(VIEW_W).toBe(340);
    expect(VIEW_H).toBe(600);
    expect(NET_Y).toBe(50);
    expect(SERVICE_LINES_Y).toEqual([32, 68]);
    expect(COURT_COLORS.teamA).toBe("#4A9BFF");
    expect(COURT_COLORS.teamB).toBe("#D3453B");
    expect(COURT_COLORS.ballPath).toBe("#2F8AFF");
  });

  it("maps percent to view units and back", () => {
    expect(toView({ x: 50, y: 50 })).toEqual({ x: 170, y: 300 });
    expect(toPercent({ x: 170, y: 300 })).toEqual({ x: 50, y: 50 });
  });

  it("maps legacy 280×520 coordinates to percent of the playing surface (rule 12)", () => {
    expect(legacyToPercent({ x: 20, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(legacyToPercent({ x: 260, y: 500 })).toEqual({ x: 100, y: 100 });
    expect(legacyToPercent({ x: 80, y: 140 })).toEqual({ x: 25, y: 25 });
  });
});

describe("game mode starting position (rule 7)", () => {
  it("is a fixed 2v2 at the canvas coordinates", () => {
    expect(GAME_START_POSITION).toHaveLength(4);
    expect(player(GAME_START_POSITION, "A1")).toMatchObject({ team: "A", x: 32, y: 26 });
    expect(player(GAME_START_POSITION, "A2")).toMatchObject({ team: "A", x: 62, y: 26 });
    expect(player(GAME_START_POSITION, "B1")).toMatchObject({ team: "B", x: 32, y: 70 });
    expect(player(GAME_START_POSITION, "B2")).toMatchObject({ team: "B", x: 62, y: 70 });
  });

  it("newDiagram('game') starts there with no steps and is not the same array", () => {
    const d = newDiagram("game");
    expect(d.version).toBe(2);
    expect(d.mode).toBe("game");
    expect(d.pieces).toEqual(GAME_START_POSITION);
    expect(d.pieces).not.toBe(GAME_START_POSITION);
    expect(d.steps).toEqual([]);
  });
});

describe("ball paths (rule 9)", () => {
  it("a flat path is a straight line in view units", () => {
    expect(ballPathD({ from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" })).toBe(
      "M197.2,120 L136,480"
    );
  });

  it("a lob bows LOB_BOW percent to the right of travel", () => {
    const from = { x: 58, y: 20 };
    const to = { x: 40, y: 80 };
    const c = lobControlPoint(from, to);
    // Travel is down-left; the canvas bows the lob toward +x.
    expect(c.x).toBeGreaterThan(49);
    // The curve passes through 0.25·from + 0.5·c + 0.25·to; the visible bow is LOB_BOW.
    const midX = 0.25 * from.x + 0.5 * c.x + 0.25 * to.x;
    const midY = 0.25 * from.y + 0.5 * c.y + 0.25 * to.y;
    const bow = Math.hypot(midX - 49, midY - 50);
    expect(bow).toBeCloseTo(LOB_BOW, 5);
    expect(ballPathD({ from, to, style: "lob" })).toMatch(/^M197.2,120 Q[\d.]+,[\d.]+ 136,480$/);
  });
});

describe("hit testing helpers", () => {
  it("nearestPlayer finds the closest player within 12 percent and null beyond", () => {
    const near = nearestPlayer(GAME_START_POSITION, { x: 35, y: 30 });
    expect(near?.kind === "player" && near.label).toBe("A1");
    expect(nearestPlayer(GAME_START_POSITION, { x: 50, y: 50 })).toBeNull();
  });

  it("hitTestPiece prefers the closest piece inside the radius", () => {
    const pieces: Piece[] = [
      ...GAME_START_POSITION,
      { id: "c1", kind: "cone", x: 33, y: 28 },
    ];
    expect(hitTestPiece(pieces, { x: 33.5, y: 28 }, 6)?.id).toBe("c1");
    expect(hitTestPiece(pieces, { x: 90, y: 90 }, 6)).toBeNull();
  });
});

describe("upgradeCourtDiagram (rule 12)", () => {
  it("upgrades the spec's legacy fixture into basket mode", () => {
    const d = upgradeCourtDiagram(LEGACY);
    expect(d.version).toBe(2);
    expect(d.mode).toBe("basket");
    expect(player(d.pieces, "A1")).toMatchObject({ team: "A", x: 25, y: 25 });
    expect(player(d.pieces, "B1")).toMatchObject({ team: "B", x: 25, y: 75 });
    expect(d.pieces.find((p) => p.kind === "feeder")).toMatchObject({ x: 50, y: 50 });
    expect(d.pieces.some((p) => (p as { kind: string }).kind === "blocker")).toBe(false);
    expect(d.pieces).toHaveLength(3);
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0].ball).toEqual({ from: { x: 25, y: 25 }, to: { x: 25, y: 75 }, style: "lob" });
    expect(d.steps[0].movements).toEqual([]);
  });

  it("maps a straight arrow to a flat path and a movement to the nearest player", () => {
    const d = upgradeCourtDiagram({
      elements: [
        { id: "p1", type: "player_1", x: 80, y: 140 },
        { id: "p2", type: "player_2", x: 200, y: 140 },
        { id: "a", type: "arrow", x: 80, y: 140, endX: 200, endY: 380, curve: 1 },
        { id: "m", type: "movement", x: 84, y: 150, endX: 140, endY: 260 },
        { id: "far", type: "movement", x: 140, y: 400, endX: 100, endY: 450 },
      ],
    });
    expect(d.mode).toBe("game");
    expect(d.steps[0].ball?.style).toBe("flat");
    expect(d.steps[0].movements).toEqual([{ pieceId: "p1", to: { x: 50, y: 50 } }]);
  });

  it("returns a v2 diagram unchanged and builds the 2v2 start for undefined", () => {
    const v2: CourtDiagramV2 = { version: 2, mode: "game", pieces: [], steps: [] };
    expect(upgradeCourtDiagram(v2)).toBe(v2);
    const fresh = upgradeCourtDiagram(undefined);
    expect(fresh.mode).toBe("game");
    expect(fresh.pieces).toEqual(GAME_START_POSITION);
    expect(fresh.steps).toEqual([]);
  });

  it("an empty legacy diagram becomes the 2v2 start", () => {
    const d = upgradeCourtDiagram({ elements: [] });
    expect(d.pieces).toEqual(GAME_START_POSITION);
  });
});

// ── Wave 4 — steps and playback (rules 18–20, PAD-245) ──────────────────────

const TWO_STEPS: CourtDiagramV2 = {
  version: 2,
  mode: "game",
  pieces: GAME_START_POSITION.map((p) => ({ ...p })),
  steps: [
    { id: "s1", ball: { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" }, movements: [{ pieceId: "a1", to: { x: 20, y: 40 } }] },
    { id: "s2", ball: { from: { x: 40, y: 80 }, to: { x: 60, y: 30 }, style: "lob" }, movements: [{ pieceId: "a1", to: { x: 10, y: 60 } }] },
  ],
};

describe("piecesAtStep / positionAfterStep (rule 18)", () => {
  it("step 0 starts from the starting position and later steps from the previous end", () => {
    expect(piecesAtStep(TWO_STEPS, 0).find((p) => p.id === "a1")).toMatchObject({ x: 32, y: 26 });
    expect(piecesAtStep(TWO_STEPS, 1).find((p) => p.id === "a1")).toMatchObject({ x: 20, y: 40 });
    expect(positionAfterStep(TWO_STEPS, 1).find((p) => p.id === "a1")).toMatchObject({ x: 10, y: 60 });
    expect(positionAfterStep(TWO_STEPS, 1).find((p) => p.id === "b2")).toMatchObject({ x: 62, y: 70 });
  });

  it("indexes past the end clamp to the final position", () => {
    expect(piecesAtStep(TWO_STEPS, 9).find((p) => p.id === "a1")).toMatchObject({ x: 10, y: 60 });
  });
});

describe("interpolateStep (rule 20)", () => {
  it("moves the players along their movement and the ball along a flat path", () => {
    const mid = interpolateStep(TWO_STEPS, 0, 0.5);
    expect(mid.pieces.find((p) => p.id === "a1")).toMatchObject({ x: 26, y: 33 });
    expect(mid.ball).toEqual({ x: 49, y: 50 });
    expect(interpolateStep(TWO_STEPS, 0, 0).ball).toEqual({ x: 58, y: 20 });
    expect(interpolateStep(TWO_STEPS, 0, 1).ball).toEqual({ x: 40, y: 80 });
  });

  it("a lob follows the quadratic through the drawn midpoint", () => {
    const mid = interpolateStep(TWO_STEPS, 1, 0.5);
    const expected = ballPathMidpoint(TWO_STEPS.steps[1].ball!);
    expect(mid.ball?.x).toBeCloseTo(expected.x, 6);
    expect(mid.ball?.y).toBeCloseTo(expected.y, 6);
  });

  it("a step without a ball has no ball position", () => {
    const d: CourtDiagramV2 = { ...TWO_STEPS, steps: [{ id: "s", movements: [] }] };
    expect(interpolateStep(d, 0, 0.5).ball).toBeUndefined();
  });
});
