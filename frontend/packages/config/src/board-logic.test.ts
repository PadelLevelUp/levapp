import { describe, expect, it } from "vitest";
import type { CourtDiagramV2 } from "@levelup/types";
import {
  BASKET_START_POSITION,
  GAME_START_POSITION,
  MAX_BASKET_PLAYERS,
  addPlayer,
  newDiagram,
  removePlayer,
  simplifyStroke,
} from "./court-diagram";
import {
  INITIAL_BOARD_STATE,
  boardAddStep,
  boardDeleteStep,
  boardDeleteSelected,
  boardDragEnd,
  boardHasContent,
  boardPress,
  boardSetColor,
  boardSetStep,
  boardStrokeEnd,
  boardSwitchMode,
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

// ── Wave 2 — Exercícios de cesto (rules 14–15, PAD-243) ─────────────────────

const basket = (): CourtDiagramV2 => newDiagram("basket");
const feeder = () => basket().pieces.find((p) => p.kind === "feeder")!;

describe("basket start position (rule 14)", () => {
  it("has A1, A2 and one feeder at the canvas coordinates", () => {
    expect(BASKET_START_POSITION.map((p) => p.id)).toEqual(["a1", "a2", "feeder"]);
    expect(BASKET_START_POSITION[0]).toMatchObject({ kind: "player", team: "A", label: "A1", x: 30, y: 18 });
    expect(BASKET_START_POSITION[1]).toMatchObject({ kind: "player", team: "A", label: "A2", x: 60, y: 18 });
    expect(BASKET_START_POSITION[2]).toMatchObject({ kind: "feeder", x: 46, y: 55 });
  });

  it("addPlayer appends A3 then A4 on Team A and then refuses", () => {
    expect(MAX_BASKET_PLAYERS).toBe(4);
    const d3 = addPlayer(basket());
    expect(d3.pieces.find((p) => p.id === "a3")).toMatchObject({ kind: "player", team: "A", label: "A3" });
    const d4 = addPlayer(d3, { x: 20, y: 30 });
    expect(d4.pieces.find((p) => p.id === "a4")).toMatchObject({ label: "A4", x: 20, y: 30 });
    expect(addPlayer(d4)).toBe(d4);
  });

  it("removePlayer goes down to one player and never below", () => {
    const d1 = removePlayer(basket(), "a2");
    expect(d1.pieces.filter((p) => p.kind === "player")).toHaveLength(1);
    expect(removePlayer(d1, "a1")).toBe(d1);
    expect(removePlayer(basket(), "feeder")).toEqual(basket());
  });
});

describe("boardPress — basket tools (rule 15)", () => {
  it("Bola runs from the feeder to the tapped point in one press", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "ball" };
    const r = boardPress(basket(), state, { x: 30, y: 18 }, null);
    expect(r.diagram?.steps[0].ball).toEqual({ from: { x: feeder().x, y: feeder().y }, to: { x: 30, y: 18 }, style: "flat" });
    expect(r.state.pending).toBeNull();
  });

  it("Alimentador moves the feeder to the tapped point", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "feeder" };
    const r = boardPress(basket(), state, { x: 50, y: 70 }, null);
    expect(r.diagram?.pieces.find((p) => p.kind === "feeder")).toMatchObject({ x: 50, y: 70 });
  });

  it("Jogador places the next player where the coach taps", () => {
    const state: BoardState = { ...INITIAL_BOARD_STATE, tool: "player" };
    const r = boardPress(basket(), state, { x: 45, y: 30 }, null);
    expect(r.diagram?.pieces.find((p) => p.id === "a3")).toMatchObject({ label: "A3", x: 45, y: 30 });
    expect(r.state.selectedId).toBe("a3");
  });

  it("a selected player can be deleted in basket mode, the feeder cannot", () => {
    const d = basket();
    const r = boardDeleteSelected(d, { ...INITIAL_BOARD_STATE, selectedId: "a2" });
    expect(r.diagram?.pieces.map((p) => p.id)).toEqual(["a1", "feeder"]);
    expect(boardDeleteSelected(d, { ...INITIAL_BOARD_STATE, selectedId: "feeder" }).diagram).toBeUndefined();
    expect(boardDeleteSelected(game(), { ...INITIAL_BOARD_STATE, selectedId: "a2" }).diagram).toBeUndefined();
  });
});

describe("mode switching (rules 2–3)", () => {
  it("a fresh board has no content; a cone or a step counts as content", () => {
    expect(boardHasContent(game())).toBe(false);
    const withCone = boardPress(game(), { ...INITIAL_BOARD_STATE, tool: "cone" }, { x: 50, y: 40 }, null).diagram!;
    expect(boardHasContent(withCone)).toBe(true);
    expect(boardHasContent(basket())).toBe(false);
  });

  it("switching resets to the target mode's starting position", () => {
    const d = boardSwitchMode(game(), "basket");
    expect(d.mode).toBe("basket");
    expect(d.pieces).toEqual(BASKET_START_POSITION);
    expect(d.steps).toEqual([]);
  });
});

// ── Wave 3 — Magnético (rules 16–17, PAD-244) ───────────────────────────────

const magnetic = (): CourtDiagramV2 => newDiagram("magnetic");

describe("simplifyStroke (Ramer–Douglas–Peucker)", () => {
  it("drops collinear points and keeps the corners", () => {
    const pts = [
      { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 10.2 }, { x: 50, y: 10 },
      { x: 50, y: 20 }, { x: 50, y: 30 },
    ];
    expect(simplifyStroke(pts, 0.5)).toEqual([{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 30 }]);
  });

  it("keeps a two-point stroke and an empty one as they are", () => {
    expect(simplifyStroke([{ x: 1, y: 1 }, { x: 5, y: 5 }])).toEqual([{ x: 1, y: 1 }, { x: 5, y: 5 }]);
    expect(simplifyStroke([])).toEqual([]);
  });
});

describe("Magnético pieces (rule 16)", () => {
  it("a finished pen stroke becomes a stroke piece in the current colour", () => {
    const state = boardSetColor({ ...INITIAL_BOARD_STATE, tool: "pen" }, "red");
    expect(state.color).toBe("red");
    const d = boardStrokeEnd(magnetic(), [{ x: 10, y: 10 }, { x: 20, y: 12 }, { x: 30, y: 30 }], state.color);
    const stroke = d.pieces.find((p) => p.kind === "stroke");
    expect(stroke).toMatchObject({ id: "stroke-1", color: "red" });
    expect(stroke && stroke.kind === "stroke" ? stroke.points.length : 0).toBeGreaterThanOrEqual(2);
    expect(boardStrokeEnd(d, [{ x: 1, y: 1 }], "blue")).toBe(d);
  });

  it("Jogador places a free player whose team follows the swatch and whose label counts up", () => {
    const blue: BoardState = { ...INITIAL_BOARD_STATE, tool: "player", color: "blue" };
    const r1 = boardPress(magnetic(), blue, { x: 30, y: 30 }, null);
    expect(r1.diagram?.pieces[0]).toMatchObject({ kind: "player", team: "A", label: "A1" });
    const red = boardSetColor(r1.state, "red");
    const r2 = boardPress(r1.diagram!, red, { x: 60, y: 70 }, null);
    expect(r2.diagram?.pieces[1]).toMatchObject({ kind: "player", team: "B", label: "B1" });
    const r3 = boardPress(r2.diagram!, boardSetColor(red, "amber"), { x: 50, y: 50 }, null);
    expect(r3.diagram?.pieces[2]).toMatchObject({ team: "A", label: "A2" });
  });

  it("Cone and Bola take the selected colour", () => {
    const amber: BoardState = { ...INITIAL_BOARD_STATE, tool: "cone", color: "amber" };
    const withCone = boardPress(magnetic(), amber, { x: 20, y: 20 }, null).diagram!;
    expect(withCone.pieces.find((p) => p.kind === "cone")).toMatchObject({ color: "amber" });
    const withBall = boardPress(withCone, { ...amber, tool: "ball", color: "white" }, { x: 40, y: 40 }, null).diagram!;
    expect(withBall.pieces.find((p) => p.kind === "ball")).toMatchObject({ id: "ball-1", color: "white" });
    expect(withBall.steps).toEqual([]);
  });

  it("any piece can be deleted in magnetic mode and the board counts as content", () => {
    const d = boardPress(magnetic(), { ...INITIAL_BOARD_STATE, tool: "player" }, { x: 30, y: 30 }, null).diagram!;
    expect(boardHasContent(d)).toBe(true);
    expect(boardDeleteSelected(d, { ...INITIAL_BOARD_STATE, selectedId: "a1" }).diagram?.pieces).toEqual([]);
  });
});

// ── Wave 4 — steps (rule 18, PAD-245) ───────────────────────────────────────

describe("step management (rule 18)", () => {
  it("a new board is on step 0; adding a step appends one and moves to it", () => {
    expect(INITIAL_BOARD_STATE.stepIndex).toBe(0);
    const r = boardAddStep(game(), INITIAL_BOARD_STATE);
    expect(r.diagram.steps).toHaveLength(2);
    expect(r.state.stepIndex).toBe(1);
    expect(r.state.selectedId).toBeNull();
  });

  it("presses write to the current step, and movements start from the previous step's end", () => {
    const s0 = { ...INITIAL_BOARD_STATE, tool: "movement" as const };
    const d1 = boardPress(game(), boardPress(game(), s0, { x: 32, y: 26 }, a1).state, { x: 20, y: 40 }, null).diagram!;
    const added = boardAddStep(d1, s0);
    const s1 = { ...added.state, tool: "ball" as const };
    const r1 = boardPress(added.diagram, s1, { x: 20, y: 40 }, null);
    const r2 = boardPress(added.diagram, r1.state, { x: 60, y: 60 }, null);
    expect(r2.diagram?.steps[1].ball).toEqual({ from: { x: 20, y: 40 }, to: { x: 60, y: 60 }, style: "flat" });
    expect(r2.diagram?.steps[0].ball).toBeUndefined();
    expect(boardToggleBallStyle(r2.diagram!, 1).steps[1].ball?.style).toBe("lob");
    expect(boardToggleBallStyle(r2.diagram!, 0)).toBe(r2.diagram);
  });

  it("deleting the current step removes it and clamps the index", () => {
    const two = boardAddStep(game(), INITIAL_BOARD_STATE);
    const r = boardDeleteStep(two.diagram, two.state);
    expect(r.diagram.steps).toHaveLength(1);
    expect(r.state.stepIndex).toBe(0);
    const none = boardDeleteStep(r.diagram, r.state);
    expect(none.diagram.steps).toHaveLength(0);
    expect(none.state.stepIndex).toBe(0);
  });

  it("boardSetStep clamps to the existing steps", () => {
    const two = boardAddStep(game(), INITIAL_BOARD_STATE);
    expect(boardSetStep(two.state, two.diagram, 5).stepIndex).toBe(1);
    expect(boardSetStep(two.state, two.diagram, -1).stepIndex).toBe(0);
  });
});
