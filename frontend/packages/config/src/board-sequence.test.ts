import { describe, expect, it } from "vitest";
import type { CourtDiagramV2, Step } from "@levelup/types";
import {
  GAME_START_POSITION,
  interpolateStep,
  isSequencedStep,
  newDiagram,
  playbackFrameAt,
  stepActionNumbers,
  stepDurationMs,
  stepTimeline,
} from "./court-diagram";
import { INITIAL_BOARD_STATE, boardMoveBallPath, boardPress, type BoardState } from "./board-logic";

// PAD-311 / training.tactical-board rule 26: actions play in the order they
// were drawn. Shared by web and iOS; iOS playback cannot be observed by Maestro
// (ledger B-114), so these tests are the iOS proof of the timeline.

const a1 = GAME_START_POSITION[0];
const b1 = GAME_START_POSITION[2];
const ball = (s: BoardState, d: CourtDiagramV2, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const st = { ...s, tool: "ball" as const, pending: null, pendingPlayerId: null };
  const r1 = boardPress(d, st, from, null);
  return boardPress(d, r1.state, to, null).diagram!;
};
const move = (d: CourtDiagramV2, piece: typeof a1, to: { x: number; y: number }) => {
  const st = { ...INITIAL_BOARD_STATE, tool: "movement" as const };
  const r1 = boardPress(d, st, { x: piece.x, y: piece.y }, piece);
  return boardPress(d, r1.state, to, null).diagram!;
};
const at = (d: CourtDiagramV2, ms: number) => {
  const frame = playbackFrameAt(d, ms)!;
  return interpolateStep(d, frame.step, frame.t);
};
const pos = (f: ReturnType<typeof interpolateStep>, id: string) => {
  const p = f.pieces.find((x) => x.id === id);
  return p && p.kind !== "stroke" ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2) } : null;
};
const round = (p?: { x: number; y: number }) => (p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2) } : p);

/** The criterion's step: ball → A1 moves → ball. */
function ballMoveBall(): CourtDiagramV2 {
  let d = newDiagram("game");
  d = ball(INITIAL_BOARD_STATE, d, { x: 58, y: 20 }, { x: 50, y: 50 });
  d = move(d, a1, { x: 50, y: 50 });
  d = ball(INITIAL_BOARD_STATE, d, { x: 50, y: 50 }, { x: 40, y: 80 });
  return d;
}

describe("stamping seq on creation (rule 26)", () => {
  it("each ball path and movement drawn gets the next seq in its step", () => {
    const d = ballMoveBall();
    const s = d.steps[0];
    expect(s.balls?.map((b) => b.seq)).toEqual([0, 2]);
    expect(s.movements.map((m) => m.seq)).toEqual([1]);
    expect(isSequencedStep(s)).toBe(true);
    // the older-build mirror carries the first path, seq included
    expect(s.ball).toEqual(s.balls?.[0]);
  });

  it("drawing into a legacy step stamps what it holds first: balls, then movements", () => {
    const legacy: CourtDiagramV2 = {
      ...newDiagram("game"),
      steps: [{ id: "s", balls: [{ from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" }], movements: [{ pieceId: "b1", to: { x: 60, y: 60 } }] }],
    };
    const d = move(legacy, a1, { x: 20, y: 40 });
    const s = d.steps[0];
    expect(s.balls?.[0].seq).toBe(0);
    expect(s.movements.map((m) => [m.pieceId, m.seq])).toEqual([["b1", 1], ["a1", 2]]);
  });

  it("reordering ball paths swaps their places in the play order and leaves movements alone", () => {
    const d = boardMoveBallPath(ballMoveBall(), 0, 1, 0);
    const s = d.steps[0];
    expect(s.balls?.map((b) => [b.to, b.seq])).toEqual([[{ x: 40, y: 80 }, 0], [{ x: 50, y: 50 }, 2]]);
    expect(s.movements[0].seq).toBe(1);
  });
});

describe("the timeline of a sequenced step (rule 26)", () => {
  it("ball → move → ball is three 800 ms moments, played one after another", () => {
    const d = ballMoveBall();
    expect(stepTimeline(d.steps[0])).toEqual([
      { kind: "ball", ball: 0 },
      { kind: "move", moves: [0] },
      { kind: "ball", ball: 1 },
    ]);
    expect(stepDurationMs(d.steps[0])).toBe(2400);

    const f400 = at(d, 400);
    expect(round(f400.ball)).toEqual({ x: 54, y: 35 });
    expect(pos(f400, "a1")).toEqual({ x: a1.x, y: a1.y });

    const f1200 = at(d, 1200);
    expect(round(f1200.ball)).toEqual({ x: 50, y: 50 });
    expect(pos(f1200, "a1")).toEqual({ x: (a1.x + 50) / 2, y: (a1.y + 50) / 2 });

    const f2000 = at(d, 2000);
    expect(pos(f2000, "a1")).toEqual({ x: 50, y: 50 });
    expect(round(f2000.ball)).toEqual({ x: 45, y: 65 });
    expect(playbackFrameAt(d, 2400)).toBeNull();
  });

  it("consecutive movements of different players share a moment; a player's next leg is the next", () => {
    let d = newDiagram("game");
    d = move(d, a1, { x: 20, y: 40 });
    d = move(d, b1, { x: 60, y: 60 });
    // A1 again: a second leg (PAD-309), from where the first ended
    const st = { ...INITIAL_BOARD_STATE, tool: "movement" as const };
    const r1 = boardPress(d, st, { x: a1.x, y: a1.y }, a1);
    d = boardPress(d, r1.state, { x: 10, y: 60 }, null).diagram!;

    expect(stepTimeline(d.steps[0])).toEqual([
      { kind: "move", moves: [0, 1] },
      { kind: "move", moves: [2] },
    ]);
    expect(stepDurationMs(d.steps[0])).toBe(1600);
    const f400 = at(d, 400);
    expect(pos(f400, "a1")).toEqual({ x: (a1.x + 20) / 2, y: (a1.y + 40) / 2 });
    expect(pos(f400, "b1")).toEqual({ x: (b1.x + 60) / 2, y: (b1.y + 60) / 2 });
    const f1200 = at(d, 1200);
    expect(pos(f1200, "a1")).toEqual({ x: 15, y: 50 });
    expect(pos(f1200, "b1")).toEqual({ x: 60, y: 60 });
  });

  it("numbers every action by its moment, parallel movements sharing one", () => {
    expect(stepActionNumbers(ballMoveBall().steps[0])).toEqual({ balls: [1, 3], movements: [2] });
    let d = newDiagram("game");
    d = move(d, a1, { x: 20, y: 40 });
    d = move(d, b1, { x: 60, y: 60 });
    expect(stepActionNumbers(d.steps[0])).toEqual({ balls: [], movements: [null, null] }); // one moment: no numbers
  });
});

describe("legacy fallback: a step with no seq plays as before (rule 26, decision (a))", () => {
  const LEGACY: CourtDiagramV2 = {
    ...newDiagram("game"),
    steps: [
      {
        id: "s",
        balls: [
          { from: { x: 58, y: 20 }, to: { x: 50, y: 50 }, style: "flat" },
          { from: { x: 50, y: 50 }, to: { x: 40, y: 80 }, style: "flat" },
        ],
        movements: [{ pieceId: "a1", to: { x: 50, y: 50 } }],
      } as Step,
    ],
  };

  it("is not sequenced and has no timeline", () => {
    expect(isSequencedStep(LEGACY.steps[0])).toBe(false);
    expect(stepTimeline(LEGACY.steps[0])).toBeNull();
  });

  it("lasts 800 ms per ball path and moves the player while the ball travels", () => {
    expect(stepDurationMs(LEGACY.steps[0])).toBe(1600);
    const f400 = at(LEGACY, 400);
    expect(round(f400.ball)).toEqual({ x: 54, y: 35 });
    expect(pos(f400, "a1")).toEqual({ x: a1.x + (50 - a1.x) / 4, y: a1.y + (50 - a1.y) / 4 });
  });

  it("numbers only the ball paths, as rule 23", () => {
    expect(stepActionNumbers(LEGACY.steps[0])).toEqual({ balls: [1, 2], movements: [null] });
  });
});
