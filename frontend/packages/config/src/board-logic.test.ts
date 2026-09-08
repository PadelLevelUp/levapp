import { describe, expect, it } from "vitest";
import type { CourtDiagramV2 } from "@levelup/types";
import { GAME_START_POSITION, newDiagram } from "./court-diagram";
import {
  INITIAL_BOARD_STATE,
  boardDragEnd,
  boardPress,
  boardToggleBallStyle,
  type BoardState,
} from "./board-logic";

// The pure interaction model behind both shells (training.tactical-board rules 8–11).
// The mobile board drives this from its gesture layer; the tests here are the unit
// coverage iOS otherwise cannot have (component rendering is Maestro's job).

const game = (): CourtDiagramV2 => newDiagram("game");
const a1 = GAME_START_POSITION[0];
const b2 = GAME_START_POSITION[3];

describe("boardPress — Bola", () => {
  it("first press starts a path, second press finishes a flat one", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    const r1 = boardPress(game(), state, { x: 58, y: 20 }, null);
    expect(r1.diagram).toBeUndefined();
    expect(r1.state.pending).toEqual({ kind: "ball", from: { x: 58, y: 20 } });
    const r2 = boardPress(game(), r1.state, { x: 40, y: 80 }, null);
    expect(r2.diagram?.steps[0].ball).toEqual({ from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" });
    expect(r2.state.pending).toBeNull();
  });

  it("two presses on the same spot do not make a path", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    const r1 = boardPress(game(), state, { x: 58, y: 20 }, null);
    const r2 = boardPress(game(), r1.state, { x: 59, y: 20 }, null);
    expect(r2.diagram).toBeUndefined();
    expect(r2.state.pending?.from).toEqual({ x: 59, y: 20 });
  });

  it("toggling the style flips flat and lob", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    const r = boardPress(game(), boardPress(game(), state, { x: 58, y: 20 }, null).state, { x: 40, y: 80 }, null);
    const lob = boardToggleBallStyle(r.diagram!);
    expect(lob.steps[0].ball?.style).toBe("lob");
    expect(boardToggleBallStyle(lob).steps[0].ball?.style).toBe("flat");
  });
});

describe("boardPress — Movimentação", () => {
  it("pressing a player then the court records that player's movement", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "movement" };
    const r1 = boardPress(game(), state, { x: 32, y: 26 }, a1);
    expect(r1.diagram).toBeUndefined();
    expect(r1.state.pendingPlayerId).toBe("a1");
    const r2 = boardPress(game(), r1.state, { x: 20, y: 40 }, null);
    expect(r2.diagram?.steps[0].movements).toEqual([{ pieceId: "a1", to: { x: 20, y: 40 } }]);
    expect(r2.state.pendingPlayerId).toBeNull();
  });

  it("a second movement for the same player replaces the first", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "movement" };
    const d1 = boardPress(game(), boardPress(game(), state, { x: 32, y: 26 }, a1).state, { x: 20, y: 40 }, null).diagram!;
    const d2 = boardPress(d1, boardPress(d1, state, { x: 32, y: 26 }, a1).state, { x: 10, y: 50 }, null).diagram!;
    expect(d2.steps[0].movements).toEqual([{ pieceId: "a1", to: { x: 10, y: 50 } }]);
  });

  it("pressing the court with no player pending does nothing", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "movement" };
    expect(boardPress(game(), state, { x: 20, y: 40 }, null).diagram).toBeUndefined();
  });
});

describe("boardPress — Selecionar", () => {
  it("selects a piece, then tap-to-moves it", () => {
    const r1 = boardPress(game(), INITIAL_BOARD_STATE, { x: 62, y: 70 }, b2);
    expect(r1.state.selectedId).toBe("b2");
    expect(r1.dragId).toBe("b2");
    const r2 = boardPress(game(), r1.state, { x: 50, y: 85 }, null);
    expect(r2.diagram?.pieces.find((p) => p.id === "b2")).toMatchObject({ x: 50, y: 85 });
    expect(r2.state.selectedId).toBe("b2");
  });

  it("a drag end moves the piece to where it was released", () => {
    const d = boardDragEnd(game(), "a2", { x: 70, y: 30 });
    expect(d.pieces.find((p) => p.id === "a2")).toMatchObject({ x: 70, y: 30 });
  });
});

describe("boardPress — Cone", () => {
  it("places indexed cones and selects the new one", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "cone" };
    const r1 = boardPress(game(), state, { x: 50, y: 40 }, null);
    expect(r1.diagram?.pieces.find((p) => p.id === "cone-1")).toMatchObject({ kind: "cone", x: 50, y: 40 });
    expect(r1.state.selectedId).toBe("cone-1");
    const r2 = boardPress(r1.diagram!, r1.state, { x: 60, y: 40 }, null);
    expect(r2.diagram?.pieces.map((p) => p.id)).toContain("cone-2");
  });
});
