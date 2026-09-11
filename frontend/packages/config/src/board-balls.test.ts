/**
 * PAD-289 — several ball paths per step (training.tactical-board rules 9, 20, 23, 24).
 * The reducer appends instead of replacing, numbers and reorders paths, mirrors `ball`
 * for older builds, and playback plays a step's paths one after the other.
 */
import { describe, expect, it } from "vitest";
import type { BallPath, CourtDiagramV2, Step } from "@levelup/types";
import {
  ballHandleHit,
  boardMoveBallPath,
  boardPress,
  boardRemoveBallPath,
  boardToggleBallStyle,
  INITIAL_BOARD_STATE,
  type BoardState,
} from "./board-logic";
import { interpolateStep, newDiagram, STEP_DURATION_MS, stepBalls, stepDurationMs, withBalls } from "./court-diagram";

const game = (): CourtDiagramV2 => newDiagram("game");
const p1: BallPath = { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" };
const p2: BallPath = { from: { x: 40, y: 80 }, to: { x: 70, y: 30 }, style: "flat" };

function drawn(...paths: BallPath[]): CourtDiagramV2 {
  const d = game();
  return { ...d, steps: [withBalls({ id: "s1", movements: [] }, paths)] };
}

describe("stepBalls / withBalls (rule 24)", () => {
  it("reads `balls` when present, else the single `ball`, else nothing", () => {
    expect(stepBalls({ id: "s", movements: [], balls: [p1, p2] })).toEqual([p1, p2]);
    expect(stepBalls({ id: "s", movements: [], ball: p1 })).toEqual([p1]);
    expect(stepBalls({ id: "s", movements: [] })).toEqual([]);
  });

  it("writes `balls` and mirrors `ball` to the first path; no ball when empty", () => {
    const s: Step = withBalls({ id: "s", movements: [] }, [p2, p1]);
    expect(s.balls).toEqual([p2, p1]);
    expect(s.ball).toEqual(p2);
    const empty = withBalls(s, []);
    expect(empty.balls).toEqual([]);
    expect(empty.ball).toBeUndefined();
  });
});

describe("boardPress — Bola appends (rules 9, 23)", () => {
  it("a second path is appended after the first, in order", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    let d = game();
    let r = boardPress(d, state, p1.from, null);
    r = boardPress(d, r.state, p1.to, null);
    d = r.diagram!;
    r = boardPress(d, r.state, p2.from, null);
    r = boardPress(d, r.state, p2.to, null);
    d = r.diagram!;
    expect(stepBalls(d.steps[0])).toEqual([p1, p2]);
    expect(d.steps[0].ball).toEqual(p1);
  });

  it("basket feeds append too, each from the feeder", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    let d = newDiagram("basket");
    d = boardPress(d, state, { x: 30, y: 18 }, null).diagram!;
    d = boardPress(d, state, { x: 60, y: 18 }, null).diagram!;
    const balls = stepBalls(d.steps[0]);
    expect(balls).toHaveLength(2);
    expect(balls.map((b) => b.from)).toEqual([{ x: 46, y: 55 }, { x: 46, y: 55 }]);
    expect(balls[1].to.x).toBe(60);
  });
});

describe("toggle, hit-test, reorder, remove (rule 23)", () => {
  it("toggles only the addressed path", () => {
    const d = boardToggleBallStyle(drawn(p1, p2), 0, 1);
    expect(stepBalls(d.steps[0]).map((b) => b.style)).toEqual(["flat", "lob"]);
    expect(d.steps[0].ball?.style).toBe("flat");
  });

  it("hit-tests every path's handle and answers the index, -1 when none", () => {
    const d = drawn(p1, p2);
    expect(ballHandleHit(d, { x: 49, y: 50 }, 6, 0)).toBe(0); // midpoint of p1
    expect(ballHandleHit(d, { x: 55, y: 55 }, 6, 0)).toBe(1); // midpoint of p2
    expect(ballHandleHit(d, { x: 5, y: 5 }, 6, 0)).toBe(-1);
  });

  it("moves a path up or down and mirrors `ball`", () => {
    const d = boardMoveBallPath(drawn(p1, p2), 0, 1, 0);
    expect(stepBalls(d.steps[0])).toEqual([p2, p1]);
    expect(d.steps[0].ball).toEqual(p2);
    expect(boardMoveBallPath(d, 0, 0, 5)).toBe(d); // out of range: unchanged
  });

  it("removes a path; removing the last one leaves the step without a ball", () => {
    const one = boardRemoveBallPath(drawn(p1, p2), 0, 0);
    expect(stepBalls(one.steps[0])).toEqual([p2]);
    expect(one.steps[0].ball).toEqual(p2);
    const none = boardRemoveBallPath(one, 0, 0);
    expect(stepBalls(none.steps[0])).toEqual([]);
    expect(none.steps[0].ball).toBeUndefined();
  });
});

describe("playback plays the paths in order (rule 20)", () => {
  it("a step lasts 800 ms per path and the ball follows them one after the other", () => {
    const d = drawn(p1, p2);
    expect(stepDurationMs(d.steps[0])).toBe(2 * STEP_DURATION_MS);
    expect(stepDurationMs({ id: "x", movements: [] })).toBe(STEP_DURATION_MS);
    expect(interpolateStep(d, 0, 0).ball).toEqual(p1.from);
    expect(interpolateStep(d, 0, 0.25).ball).toEqual({ x: 49, y: 50 }); // halfway along p1
    expect(interpolateStep(d, 0, 0.5).ball).toEqual(p2.from);
    expect(interpolateStep(d, 0, 1).ball).toEqual(p2.to);
  });
});
