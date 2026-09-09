export type ExerciseType =
  | "attack"
  | "defense"
  | "serve"
  | "return"
  | "volley"
  | "transition"
  | "warm_up"
  | "footwork"
  | "custom";

export const EXERCISE_TYPE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: "attack", label: "Attack" },
  { value: "defense", label: "Defense" },
  { value: "serve", label: "Serve" },
  { value: "return", label: "Return" },
  { value: "volley", label: "Volley" },
  { value: "transition", label: "Transition" },
  { value: "warm_up", label: "Warm-up" },
  { value: "footwork", label: "Footwork" },
  { value: "custom", label: "Custom" },
];

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 1, label: "Beginner" },
  { value: 2, label: "Basic" },
  { value: 3, label: "Intermediate" },
  { value: 4, label: "Advanced" },
  { value: 5, label: "Expert" },
];

export type CourtElementType =
  | "player_1"
  | "player_2"
  | "player_3"
  | "player_4"
  | "coach"
  | "cone"
  | "blocker"
  | "ball"
  | "arrow"
  | "movement";

/** Legacy (v1) diagram element — kept readable, never written by the tactical board. */
export interface CourtElement {
  id: string;
  type: CourtElementType;
  x: number;
  y: number;
  // For arrows / movement lines
  endX?: number;
  endY?: number;
  // For players or line labels (e.g. "Lob", "Smash")
  label?: string;
  // Curve offset for arrows/movements (perpendicular px offset for quadratic bezier)
  curve?: number;
  // Rotation in degrees
  rotation?: number;
}

/**
 * Legacy (v1) diagram shape: a flat element list in the old 280×520 viewBox
 * (20-unit padding). `upgradeCourtDiagram()` in @levelup/config turns it into
 * a `CourtDiagramV2` on read (training.tactical-board rule 12).
 */
export interface CourtDiagramV1 {
  elements: CourtElement[];
}

/** @deprecated alias for the legacy shape — new code uses `CourtDiagramV2` / `AnyCourtDiagram`. */
export type CourtDiagram = CourtDiagramV1;

// ── Tactical board (v2) — training.tactical-board ───────────────────────────
// Coordinates are percent of the playing surface, 0..100 on both axes, so web
// and iOS render the same JSON identically whatever the pixel size.

export type Team = "A" | "B";
/** Situações de jogo | Exercícios de cesto | Magnético */
export type BoardMode = "game" | "basket" | "magnetic";
export interface Point {
  x: number;
  y: number;
}
/** The five colour swatches of the Magnético toolbar. */
export type PieceColor = "white" | "green" | "blue" | "red" | "amber";

export type Piece =
  | { id: string; kind: "player"; team: Team; label: string; x: number; y: number }
  | { id: string; kind: "feeder"; x: number; y: number }
  | { id: string; kind: "cone"; x: number; y: number; color?: PieceColor }
  | { id: string; kind: "ball"; x: number; y: number; color?: PieceColor }
  | { id: string; kind: "stroke"; color: PieceColor; points: Point[] };

export type PieceKind = Piece["kind"];

/** One ball trajectory: plana (straight) or lob (quadratic curve). */
export interface BallPath {
  from: Point;
  to: Point;
  style: "flat" | "lob";
}

/** A player's dashed movement path within a step. */
export interface Movement {
  pieceId: string;
  to: Point;
}

export interface Step {
  id: string;
  ball?: BallPath;
  movements: Movement[];
}

export interface CourtDiagramV2 {
  version: 2;
  mode: BoardMode;
  /** The starting position. */
  pieces: Piece[];
  /** Ordered; may be empty for a purely static board. */
  steps: Step[];
}

export type AnyCourtDiagram = CourtDiagramV1 | CourtDiagramV2;

export function isCourtDiagramV2(d: AnyCourtDiagram | null | undefined): d is CourtDiagramV2 {
  return !!d && (d as CourtDiagramV2).version === 2;
}

export interface Exercise {
  id: string;
  name: string;
  description?: string;
  type: ExerciseType;
  customType?: string;
  difficulty: Difficulty;
  levelIds: string[];
  diagram?: AnyCourtDiagram;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExercisePayload {
  name: string;
  description?: string;
  type: ExerciseType;
  customType?: string;
  difficulty: Difficulty;
  levelIds: string[];
  diagram?: AnyCourtDiagram;
  notes?: string;
}

export interface ExerciseGroup {
  id: string;
  name: string;
  description?: string;
  exerciseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseGroupPayload {
  name: string;
  description?: string;
  exerciseIds: string[];
}
