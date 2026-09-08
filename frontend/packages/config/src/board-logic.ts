/**
 * Pure interaction model for the tactical board (training.tactical-board
 * rules 8–11). A press at a point, with whatever piece was under it, yields
 * the next interaction state and — when something changed — the next
 * diagram. Both shells drive this from their own input layer (DOM pointer
 * events on web, a gesture-handler Pan on iOS) so the behaviour cannot drift
 * between them, and iOS gets unit coverage its component layer cannot have.
 */
import type { CourtDiagramV2, Piece, Point, Step } from "@levelup/types";
import { HIT_RADIUS, MIN_PATH_LENGTH, ballPathMidpoint, newStep } from "./court-diagram";

export type BoardTool = "select" | "ball" | "movement" | "cone";

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
}

export const INITIAL_BOARD_STATE: BoardState = {
  tool: "select",
  selectedId: null,
  pending: null,
  pendingPlayerId: null,
};

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
  const step = patch(firstStep(d));
  return { ...d, steps: d.steps.length === 0 ? [step] : [step, ...d.steps.slice(1)] };
}

export function boardSelectTool(state: BoardState, tool: BoardTool): BoardState {
  return { ...state, tool, pending: null, pendingPlayerId: null, selectedId: null };
}

export function boardMovePiece(d: CourtDiagramV2, id: string, to: Point): CourtDiagramV2 {
  return { ...d, pieces: d.pieces.map((p) => (p.id === id && p.kind !== "stroke" ? { ...p, x: to.x, y: to.y } : p)) };
}

/** A drag released at `position` — same as a tap-to-move, one history entry. */
export function boardDragEnd(d: CourtDiagramV2, id: string, position: Point): CourtDiagramV2 {
  return boardMovePiece(d, id, position);
}

export function boardToggleBallStyle(d: CourtDiagramV2): CourtDiagramV2 {
  const ball = d.steps[0]?.ball;
  if (!ball) return d;
  const style = ball.style === "lob" ? "flat" : "lob";
  return withFirstStep(d, (s) => ({ ...s, ball: s.ball ? { ...s.ball, style } : s.ball }));
}

/** True when `pt` lands on the plana/lob handle of the first step's ball path. */
export function ballHandleHit(d: CourtDiagramV2, pt: Point, radius = HIT_RADIUS): boolean {
  const ball = d.steps[0]?.ball;
  if (!ball) return false;
  return distance(ballPathMidpoint(ball), pt) <= radius;
}

/** Cones (and, in later waves, loose balls) can be deleted; players and the feeder are fixed in game mode (rule 7). */
export function boardDeleteSelected(d: CourtDiagramV2, state: BoardState): { diagram?: CourtDiagramV2; state: BoardState } {
  const id = state.selectedId;
  if (!id) return { state };
  const piece = d.pieces.find((p) => p.id === id);
  if (!piece || piece.kind === "player" || piece.kind === "feeder") return { state };
  return {
    diagram: {
      ...d,
      pieces: d.pieces.filter((p) => p.id !== id),
      steps: d.steps.map((s) => ({ ...s, movements: s.movements.filter((m) => m.pieceId !== id) })),
    },
    state: { ...state, selectedId: null },
  };
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
        return { state, diagram: boardMovePiece(d, state.selectedId, pt) };
      }
      return { state };
    }
    case "ball": {
      const pending = state.pending;
      if (pending && pending.kind === "ball" && distance(pending.from, pt) >= MIN_PATH_LENGTH) {
        return {
          state: { ...state, pending: null },
          diagram: withFirstStep(d, (s) => ({ ...s, ball: { from: pending.from, to: pt, style: "flat" } })),
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
        diagram: withFirstStep(d, (s) => ({
          ...s,
          movements: [...s.movements.filter((m) => m.pieceId !== playerId), { pieceId: playerId, to: pt }],
        })),
      };
    }
    case "cone": {
      const id = nextIndexedId(d.pieces, "cone");
      return {
        state: { ...state, selectedId: id },
        diagram: { ...d, pieces: [...d.pieces, { id, kind: "cone", x: pt.x, y: pt.y }] },
      };
    }
  }
}
