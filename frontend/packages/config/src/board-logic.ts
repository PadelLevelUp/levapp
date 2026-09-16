/**
 * Pure interaction model for the tactical board (training.tactical-board
 * rules 8–11, 14–17). A press at a point, with whatever piece was under it,
 * yields the next interaction state and — when something changed — the next
 * diagram. Both shells drive this from their own input layer (DOM pointer
 * events on web, a gesture-handler Pan on iOS) so the behaviour cannot drift
 * between them, and iOS gets unit coverage its component layer cannot have.
 */
import type { BoardMode, CourtDiagramV2, Piece, PieceColor, Point, Step } from "@levelup/types";
import {
  BASKET_START_POSITION,
  GAME_START_POSITION,
  HIT_RADIUS,
  MIN_PATH_LENGTH,
  addPlayer,
  ballPathMidpoint,
  newDiagram,
  newStep,
  removePlayer,
  simplifyStroke, stepBalls, withBalls } from "./court-diagram";

/** Every tool across the three modes; each mode shows its own subset (see `toolsForMode`). */
export type BoardTool = "select" | "ball" | "movement" | "cone" | "player" | "feeder" | "pen";

/** A path being drawn: first point placed, second one following the pointer. */
export interface PendingPath {
  kind: "ball" | "movement";
  from: Point;
  to?: Point;
}

export interface BoardState {
  tool: BoardTool;
  selectedId: string | null;
  pending: PendingPath | null;
  pendingPlayerId: string | null;
  /** Magnético swatch (rule 16); irrelevant in the other modes. */
  color: PieceColor;
  /** The step being edited (rule 18). A board with no steps edits an implicit step 0. */
  stepIndex: number;
}

export const INITIAL_BOARD_STATE: BoardState = {
  tool: "select",
  selectedId: null,
  pending: null,
  pendingPlayerId: null,
  color: "blue",
  stepIndex: 0,
};

/** The toolbar of each mode, in canvas order (rules 8, 15, 16). */
export function toolsForMode(mode: BoardMode): BoardTool[] {
  switch (mode) {
    case "basket":
      return ["select", "ball", "movement", "player", "feeder"];
    case "magnetic":
      return ["pen", "select", "cone", "ball", "player"];
    default:
      return ["select", "ball", "movement", "cone"];
  }
}

/** The tool a mode opens with (Caneta for Magnético, Selecionar elsewhere). */
export function defaultToolForMode(mode: BoardMode): BoardTool {
  return mode === "magnetic" ? "pen" : "select";
}

export interface PressResult {
  state: BoardState;
  /** Present only when the press mutated the diagram. */
  diagram?: CourtDiagramV2;
  /** Present when the press grabbed a piece that may now be dragged. */
  dragId?: string;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ids like `cone-1`, `cone-2` — stable and readable for tests on both platforms. */
export function nextIndexedId(pieces: readonly Piece[], prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const p of pieces) {
    const m = re.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

export function firstStep(d: CourtDiagramV2): Step {
  return d.steps[0] ?? newStep();
}

export function withFirstStep(d: CourtDiagramV2, patch: (s: Step) => Step): CourtDiagramV2 {
  return withStep(d, 0, patch);
}

/** Patch step `index`, materialising the implicit steps up to it. */
export function withStep(d: CourtDiagramV2, index: number, patch: (s: Step) => Step): CourtDiagramV2 {
  const steps = [...d.steps];
  while (steps.length <= index) steps.push(newStep());
  steps[index] = patch(steps[index]);
  return { ...d, steps };
}

/** How many steps the indicator shows: a board with none still edits step 1 of 1. */
export function stepCount(d: CourtDiagramV2): number {
  return Math.max(1, d.steps.length);
}

/** Clamp a requested step to the ones that exist. */
export function boardSetStep(state: BoardState, d: CourtDiagramV2, index: number): BoardState {
  const max = Math.max(0, d.steps.length - 1);
  const stepIndex = Math.min(max, Math.max(0, index));
  return { ...state, stepIndex, selectedId: null, pending: null, pendingPlayerId: null };
}

/** Append a step (materialising the implicit first one) and move to it (rule 18). */
export function boardAddStep(d: CourtDiagramV2, state: BoardState): { diagram: CourtDiagramV2; state: BoardState } {
  const steps = d.steps.length === 0 ? [newStep(), newStep()] : [...d.steps, newStep()];
  const diagram = { ...d, steps };
  return { diagram, state: boardSetStep(state, diagram, steps.length - 1) };
}

/** Remove the current step; the index clamps to what is left (rule 18). */
export function boardDeleteStep(d: CourtDiagramV2, state: BoardState): { diagram: CourtDiagramV2; state: BoardState } {
  if (d.steps.length === 0) return { diagram: d, state };
  const steps = d.steps.filter((_, i) => i !== state.stepIndex);
  const diagram = { ...d, steps };
  return { diagram, state: boardSetStep(state, diagram, state.stepIndex) };
}

export function boardSelectTool(state: BoardState, tool: BoardTool): BoardState {
  return { ...state, tool, pending: null, pendingPlayerId: null, selectedId: null };
}

/** Magnético swatch (rule 16). */
export function boardSetColor(state: BoardState, color: PieceColor): BoardState {
  return { ...state, color };
}

/**
 * A finished pen stroke (rule 16). Points arrive raw from the shell and are
 * simplified here; anything shorter than two points is ignored.
 */
export function boardStrokeEnd(d: CourtDiagramV2, points: readonly Point[], color: PieceColor): CourtDiagramV2 {
  const simplified = simplifyStroke(points);
  if (simplified.length < 2) return d;
  const id = nextIndexedId(d.pieces, "stroke");
  return { ...d, pieces: [...d.pieces, { id, kind: "stroke", color, points: simplified }] };
}

export function boardMovePiece(d: CourtDiagramV2, id: string, to: Point): CourtDiagramV2 {
  return { ...d, pieces: d.pieces.map((p) => (p.id === id && p.kind !== "stroke" ? { ...p, x: to.x, y: to.y } : p)) };
}

/** A drag released at `position` — same as a tap-to-move, one history entry. */
export function boardDragEnd(d: CourtDiagramV2, id: string, position: Point, state: BoardState = INITIAL_BOARD_STATE): CourtDiagramV2 {
  return moveOrRecord(d, state, id, position);
}

/** Flip one path of the step between plana and lob (rules 9, 23). */
export function boardToggleBallStyle(d: CourtDiagramV2, stepIndex = 0, pathIndex = 0): CourtDiagramV2 {
  const balls = stepBalls(d.steps[stepIndex]);
  const path = balls[pathIndex];
  if (!path) return d;
  const style = path.style === "lob" ? "flat" : "lob";
  return withStep(d, stepIndex, (s) => withBalls(s, balls.map((b, i) => (i === pathIndex ? { ...b, style } : b))));
}

/**
 * The index of the path whose plana/lob handle `pt` lands on (the nearest when
 * two overlap), or -1 when none (rule 23).
 */
export function ballHandleHit(d: CourtDiagramV2, pt: Point, radius = HIT_RADIUS, stepIndex = 0): number {
  let best = -1;
  let bestDistance = Infinity;
  stepBalls(d.steps[stepIndex]).forEach((path, i) => {
    const dist = distance(ballPathMidpoint(path), pt);
    if (dist <= radius && dist < bestDistance) {
      best = i;
      bestDistance = dist;
    }
  });
  return best;
}

/** Move path `from` to position `to` in the step's order (rule 23); unchanged when out of range. */
export function boardMoveBallPath(d: CourtDiagramV2, stepIndex: number, from: number, to: number): CourtDiagramV2 {
  const balls = stepBalls(d.steps[stepIndex]);
  if (from === to || from < 0 || to < 0 || from >= balls.length || to >= balls.length) return d;
  const next = [...balls];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return withStep(d, stepIndex, (s) => withBalls(s, next));
}

/** Remove one path of the step (rule 23); removing the last leaves the step without a ball. */
export function boardRemoveBallPath(d: CourtDiagramV2, stepIndex: number, pathIndex: number): CourtDiagramV2 {
  const balls = stepBalls(d.steps[stepIndex]);
  if (pathIndex < 0 || pathIndex >= balls.length) return d;
  return withStep(d, stepIndex, (s) => withBalls(s, balls.filter((_, i) => i !== pathIndex)));
}

/**
 * Moving a player while editing a later step records where it goes in that
 * step (a movement) rather than shifting the starting position; step 0 and
 * every other piece move the base position (rule 18).
 */
function moveOrRecord(d: CourtDiagramV2, state: BoardState, id: string, to: Point): CourtDiagramV2 {
  const piece = d.pieces.find((p) => p.id === id);
  if (state.stepIndex > 0 && piece?.kind === "player") {
    return withStep(d, state.stepIndex, (s) => ({
      ...s,
      movements: [...s.movements.filter((m) => m.pieceId !== id), { pieceId: id, to }],
    }));
  }
  return boardMovePiece(d, id, to);
}

/**
 * What can be deleted: cones, loose balls and strokes anywhere; players only in
 * basket and magnetic mode (down to one in basket, rule 14); the feeder and the
 * game-mode 2v2 never (rule 7).
 */
export function boardDeleteSelected(d: CourtDiagramV2, state: BoardState): { diagram?: CourtDiagramV2; state: BoardState } {
  const id = state.selectedId;
  if (!id) return { state };
  const piece = d.pieces.find((p) => p.id === id);
  if (!piece || piece.kind === "feeder") return { state };
  if (piece.kind === "player") {
    if (d.mode === "game") return { state };
    const next = d.mode === "basket" ? removePlayer(d, id) : removeAny(d, id);
    if (next === d) return { state };
    return { diagram: next, state: { ...state, selectedId: null } };
  }
  return { diagram: removeAny(d, id), state: { ...state, selectedId: null } };
}

function removeAny(d: CourtDiagramV2, id: string): CourtDiagramV2 {
  return {
    ...d,
    pieces: d.pieces.filter((p) => p.id !== id),
    steps: d.steps.map((s) => ({ ...s, movements: s.movements.filter((m) => m.pieceId !== id) })),
  };
}

/** True when switching mode would lose something (rule 3). */
export function boardHasContent(d: CourtDiagramV2): boolean {
  if (d.steps.some((s) => stepBalls(s).length || s.movements.length > 0)) return true;
  const start = d.mode === "basket" ? BASKET_START_POSITION : d.mode === "game" ? GAME_START_POSITION : [];
  if (d.pieces.length !== start.length) return true;
  return d.pieces.some((p, i) => {
    const s = start[i];
    if (!s || p.kind === "stroke" || s.kind === "stroke") return true;
    return p.id !== s.id || p.kind !== s.kind || p.x !== s.x || p.y !== s.y;
  });
}

/** Switching mode resets the board to that mode's starting position (rule 3). */
export function boardSwitchMode(_d: CourtDiagramV2, mode: BoardMode): CourtDiagramV2 {
  return newDiagram(mode);
}

/** Magnético: a free player's team follows the swatch (rule 16), labelled by placement order. */
function freePlayer(d: CourtDiagramV2, pt: Point, color: PieceColor): Piece {
  const team = color === "red" ? "B" : "A";
  let n = 1;
  while (d.pieces.some((p) => p.id === `${team.toLowerCase()}${n}`)) n += 1;
  return { id: `${team.toLowerCase()}${n}`, kind: "player", team, label: `${team}${n}`, x: pt.x, y: pt.y };
}

/**
 * A press (tap, or the start of a drag) at `pt`. `hit` is the piece under the
 * finger, if any — the caller hit-tests because only it knows the touch radius.
 */
export function boardPress(d: CourtDiagramV2, state: BoardState, pt: Point, hit: Piece | null): PressResult {
  switch (state.tool) {
    case "select": {
      if (hit && hit.kind !== "stroke") {
        return { state: { ...state, selectedId: hit.id }, dragId: hit.id };
      }
      if (state.selectedId) {
        // tap-to-move (rule 8): the selection stays so the coach can keep nudging it
        return { state, diagram: moveOrRecord(d, state, state.selectedId, pt) };
      }
      return { state };
    }
    case "ball": {
      if (d.mode === "magnetic") {
        // a loose ball piece in the current colour (rule 16)
        const id = nextIndexedId(d.pieces, "ball");
        return {
          state: { ...state, selectedId: id },
          diagram: { ...d, pieces: [...d.pieces, { id, kind: "ball", x: pt.x, y: pt.y, color: state.color }] },
        };
      }
      if (d.mode === "basket") {
        // "Alimentação": the ball always leaves the feeder (rule 15)
        const feeder = d.pieces.find((p) => p.kind === "feeder");
        if (!feeder || feeder.kind !== "feeder") return { state };
        return {
          state: { ...state, pending: null },
          // PAD-289: each feed is appended to the step's ordered paths (rule 23)
          diagram: withStep(d, state.stepIndex, (s) => withBalls(s, [...stepBalls(s), { from: { x: feeder.x, y: feeder.y }, to: pt, style: "flat" }])),
        };
      }
      const pending = state.pending;
      if (pending && pending.kind === "ball" && distance(pending.from, pt) >= MIN_PATH_LENGTH) {
        return {
          state: { ...state, pending: null },
          // PAD-289: appended, never replaced (rules 9, 23)
          diagram: withStep(d, state.stepIndex, (s) => withBalls(s, [...stepBalls(s), { from: pending.from, to: pt, style: "flat" }])),
        };
      }
      return { state: { ...state, pending: { kind: "ball", from: pt } } };
    }
    case "movement": {
      if (hit && hit.kind === "player") {
        return { state: { ...state, pendingPlayerId: hit.id, pending: { kind: "movement", from: { x: hit.x, y: hit.y } } } };
      }
      const playerId = state.pendingPlayerId;
      if (!playerId) return { state };
      return {
        state: { ...state, pendingPlayerId: null, pending: null },
        diagram: withStep(d, state.stepIndex, (s) => ({
          ...s,
          movements: [...s.movements.filter((m) => m.pieceId !== playerId), { pieceId: playerId, to: pt }],
        })),
      };
    }
    case "cone": {
      const id = nextIndexedId(d.pieces, "cone");
      const color = d.mode === "magnetic" ? state.color : undefined;
      return {
        state: { ...state, selectedId: id },
        diagram: { ...d, pieces: [...d.pieces, { id, kind: "cone", x: pt.x, y: pt.y, ...(color ? { color } : {}) }] },
      };
    }
    case "player": {
      if (d.mode === "magnetic") {
        const piece = freePlayer(d, pt, state.color);
        return { state: { ...state, selectedId: piece.id }, diagram: { ...d, pieces: [...d.pieces, piece] } };
      }
      const next = addPlayer(d, pt);
      if (next === d) return { state };
      const added = next.pieces[next.pieces.length - 1];
      return { state: { ...state, selectedId: added.id }, diagram: next };
    }
    case "feeder": {
      const feeder = d.pieces.find((p) => p.kind === "feeder");
      if (!feeder) return { state };
      return { state, diagram: boardMovePiece(d, feeder.id, pt) };
    }
    case "pen":
      // strokes are captured by the shells' move/up handlers (wave 3); a bare press draws nothing
      return { state };
  }
}
