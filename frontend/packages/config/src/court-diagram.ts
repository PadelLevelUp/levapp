/**
 * Court geometry, legacy migration and pure helpers for the tactical board
 * (training.tactical-board). Shared by apps/web and apps/mobile so both render
 * the same diagram JSON identically — the two shells differ only in how they
 * capture pointer/touch input and which SVG library draws the result.
 *
 * Coordinate systems:
 * - **percent** — what the diagram stores: 0..100 on both axes of the playing
 *   surface (rule 6). Anisotropic on purpose; distances mix the axes only for
 *   hit-testing, where "close enough" is all that matters.
 * - **view** — the SVG viewBox, 340×600 like the design canvas. `toView` /
 *   `toPercent` convert.
 * - **legacy** — the v1 editor's 280×520 viewBox with a 20-unit padding
 *   (rule 12).
 */
import type {
  AnyCourtDiagram,
  BallPath,
  BoardMode,
  CourtDiagramV2,
  CourtElement,
  Piece,
  Point,
  Step,
} from "@levelup/types";

function isV2(d: AnyCourtDiagram): d is CourtDiagramV2 {
  return (d as CourtDiagramV2).version === 2;
}

// ── Geometry (rule 5) ────────────────────────────────────────────────────────

export const VIEW_W = 340;
export const VIEW_H = 600;
export const COURT_ASPECT = VIEW_W / VIEW_H;
/** Net, as percent of the surface height. */
export const NET_Y = 50;
/** Service lines, as percent of the surface height. */
export const SERVICE_LINES_Y: readonly [number, number] = [32, 68];
/** Outer boundary inset, percent. */
export const BOUNDARY_INSET = 2;
/** Visible bow of a lob at its midpoint, percent of the surface width (rule 9). */
export const LOB_BOW = 12;
/** Radius of a player disc in view units (26 px on the canvas → 13). */
export const PLAYER_RADIUS = 13;
/** Hit radius for taps, in percent (≈ 20 px on a 340-wide court). */
export const HIT_RADIUS = 6;
/** Two taps closer than this (percent) do not make a ball path. */
export const MIN_PATH_LENGTH = 3;

/**
 * Diagram content colours, straight from the design-system tokens rather than
 * the shadcn status palette: telling Team A from Team B on a court is not a
 * status, and the court is blue because the canvas court is blue. Same
 * exception the old editor documented for its green court.
 */
export const COURT_COLORS = {
  surfaceTop: "#0E6BD6",
  surfaceBottom: "#0B5FC2",
  frame: "#0D1B31", // lv-navy-800
  line: "rgba(255,255,255,0.65)",
  net: "rgba(255,255,255,0.92)",
  teamA: "#4A9BFF", // lv-blue-400
  teamAText: "#0B1524",
  teamB: "#D3453B", // lv-red-600
  teamBText: "#FFFFFF",
  ballPath: "#2F8AFF", // lv-blue-500
  amber: "#D98324", // lv-amber-600 — ball and feeder
  movement: "rgba(255,255,255,0.85)",
  caption: "rgba(255,255,255,0.32)",
  selection: "#FFFFFF",
} as const;

// ── Starting positions (rule 7) ──────────────────────────────────────────────

export const GAME_START_POSITION: readonly Piece[] = [
  { id: "a1", kind: "player", team: "A", label: "A1", x: 32, y: 26 },
  { id: "a2", kind: "player", team: "A", label: "A2", x: 62, y: 26 },
  { id: "b1", kind: "player", team: "B", label: "B1", x: 32, y: 70 },
  { id: "b2", kind: "player", team: "B", label: "B2", x: 62, y: 70 },
];

/** Exercícios de cesto (rule 14): two players up front and the feeder at mid-court. */
export const BASKET_START_POSITION: readonly Piece[] = [
  { id: "a1", kind: "player", team: "A", label: "A1", x: 30, y: 18 },
  { id: "a2", kind: "player", team: "A", label: "A2", x: 60, y: 18 },
  { id: "feeder", kind: "feeder", x: 46, y: 55 },
];

/** Basket mode: one to four players, all Team A (rule 14). */
export const MAX_BASKET_PLAYERS = 4;
/** Where "Adicionar jogadores" drops A3 and A4 when no point is given. */
const BASKET_EXTRA_SLOTS: readonly Point[] = [
  { x: 20, y: 34 },
  { x: 70, y: 34 },
];

export function playerCount(d: CourtDiagramV2): number {
  return d.pieces.filter((p) => p.kind === "player").length;
}

/**
 * Add the next Team A player (A3, A4 …) at `at`, or at the next free slot.
 * Returns the same diagram when the cap is reached.
 */
export function addPlayer(d: CourtDiagramV2, at?: Point): CourtDiagramV2 {
  const count = playerCount(d);
  if (count >= MAX_BASKET_PLAYERS) return d;
  // Labels are what the coach sees, so the next free label wins; the id follows it
  // unless a legacy piece already holds that id (legacy ids are arbitrary).
  let n = 1;
  while (d.pieces.some((p) => p.kind === "player" && p.label === `A${n}`)) n += 1;
  const id = d.pieces.some((p) => p.id === `a${n}`) ? newPieceId("a") : `a${n}`;
  const slot = at ?? BASKET_EXTRA_SLOTS[Math.max(0, Math.min(count - 2, BASKET_EXTRA_SLOTS.length - 1))];
  return {
    ...d,
    pieces: [...d.pieces, { id, kind: "player", team: "A", label: `A${n}`, x: slot.x, y: slot.y }],
  };
}

/** Remove a player, never below one; anything that is not a player is left alone. */
export function removePlayer(d: CourtDiagramV2, id: string): CourtDiagramV2 {
  const piece = d.pieces.find((p) => p.id === id);
  if (!piece || piece.kind !== "player" || playerCount(d) <= 1) return d;
  return {
    ...d,
    pieces: d.pieces.filter((p) => p.id !== id),
    steps: d.steps.map((s) => ({ ...s, movements: s.movements.filter((m) => m.pieceId !== id) })),
  };
}

let idCounter = 0;
/** Local id generator — no crypto.randomUUID on Hermes. */
export function newPieceId(prefix = "p"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function newStep(): Step {
  return { id: newPieceId("s"), movements: [] };
}

export function newDiagram(mode: BoardMode): CourtDiagramV2 {
  const start = mode === "basket" ? BASKET_START_POSITION : mode === "game" ? GAME_START_POSITION : [];
  return { version: 2, mode, pieces: start.map((p) => ({ ...p })), steps: [] };
}

// ── Coordinate conversion ────────────────────────────────────────────────────

export function toView(p: Point): Point {
  return { x: (p.x * VIEW_W) / 100, y: (p.y * VIEW_H) / 100 };
}

export function toPercent(p: Point): Point {
  return { x: (p.x * 100) / VIEW_W, y: (p.y * 100) / VIEW_H };
}

export function clampPercent(p: Point): Point {
  return { x: Math.min(100, Math.max(0, p.x)), y: Math.min(100, Math.max(0, p.y)) };
}

/** Legacy 280×520 viewBox (20-unit padding, 240×480 court) → percent. */
export function legacyToPercent(p: Point): Point {
  return { x: ((p.x - 20) / 240) * 100, y: ((p.y - 20) / 480) * 100 };
}

/**
 * Where a tap landed, given the SVG's on-screen box. The court renders with
 * `preserveAspectRatio="xMidYMid meet"`, so the box may be letterboxed; this
 * mirrors that mapping so touch coordinates line up with the drawing on both
 * platforms.
 */
export function clientToPercent(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number }
): Point {
  const scale = Math.min(box.width / VIEW_W, box.height / VIEW_H) || 1;
  const offsetX = (box.width - VIEW_W * scale) / 2;
  const offsetY = (box.height - VIEW_H * scale) / 2;
  const view = { x: (clientX - box.left - offsetX) / scale, y: (clientY - box.top - offsetY) / scale };
  return toPercent(view);
}

// ── Ball paths (rule 9) ──────────────────────────────────────────────────────

/**
 * Control point of a lob. The visible curve passes through
 * 0.25·from + 0.5·c + 0.25·to at t = 0.5, so a control offset of 2·LOB_BOW
 * bows the drawn line by exactly LOB_BOW. "Right of travel" is the side the
 * canvas bows to: (dy, −dx).
 */
export function lobControlPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = dy / len;
  const py = -dx / len;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return { x: mx + px * 2 * LOB_BOW, y: my + py * 2 * LOB_BOW };
}

/** Midpoint of the drawn path (where the plana/lob handle sits), percent. */
export function ballPathMidpoint(path: BallPath): Point {
  if (path.style === "lob") {
    const c = lobControlPoint(path.from, path.to);
    return {
      x: 0.25 * path.from.x + 0.5 * c.x + 0.25 * path.to.x,
      y: 0.25 * path.from.y + 0.5 * c.y + 0.25 * path.to.y,
    };
  }
  return { x: (path.from.x + path.to.x) / 2, y: (path.from.y + path.to.y) / 2 };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** SVG `d` attribute for a ball path, in view units. */
export function ballPathD(path: BallPath): string {
  const a = toView(path.from);
  const b = toView(path.to);
  if (path.style === "lob") {
    const c = toView(lobControlPoint(path.from, path.to));
    return `M${fmt(a.x)},${fmt(a.y)} Q${fmt(c.x)},${fmt(c.y)} ${fmt(b.x)},${fmt(b.y)}`;
  }
  return `M${fmt(a.x)},${fmt(a.y)} L${fmt(b.x)},${fmt(b.y)}`;
}

/** SVG `d` for a movement (always straight, dashed by the renderer), view units. */
export function movementPathD(from: Point, to: Point): string {
  const a = toView(from);
  const b = toView(to);
  return `M${fmt(a.x)},${fmt(a.y)} L${fmt(b.x)},${fmt(b.y)}`;
}

// ── Hit testing ──────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function piecePosition(piece: Piece): Point | null {
  if (piece.kind === "stroke") return null;
  return { x: piece.x, y: piece.y };
}

/** Nearest player within `maxDist` percent, else null (rule 12 movement mapping). */
export function nearestPlayer(pieces: readonly Piece[], p: Point, maxDist = 12): Piece | null {
  let best: Piece | null = null;
  let bestD = maxDist;
  for (const piece of pieces) {
    if (piece.kind !== "player") continue;
    const d = dist({ x: piece.x, y: piece.y }, p);
    if (d <= bestD) {
      best = piece;
      bestD = d;
    }
  }
  return best;
}

/** Nearest positioned piece within `radius` percent, else null. */
export function hitTestPiece(pieces: readonly Piece[], p: Point, radius = HIT_RADIUS): Piece | null {
  let best: Piece | null = null;
  let bestD = radius;
  for (const piece of pieces) {
    const pos = piecePosition(piece);
    if (!pos) continue;
    const d = dist(pos, p);
    if (d <= bestD) {
      best = piece;
      bestD = d;
    }
  }
  return best;
}

// ── Legacy migration (rule 12) ───────────────────────────────────────────────

const LEGACY_PLAYER: Record<string, { team: "A" | "B"; label: string }> = {
  player_1: { team: "A", label: "A1" },
  player_2: { team: "A", label: "A2" },
  player_3: { team: "B", label: "B1" },
  player_4: { team: "B", label: "B2" },
};

function upgradeLegacy(elements: readonly CourtElement[]): CourtDiagramV2 {
  const pieces: Piece[] = [];
  let hadCoach = false;
  for (const el of elements) {
    const p = legacyToPercent({ x: el.x, y: el.y });
    const player = LEGACY_PLAYER[el.type];
    if (player) {
      pieces.push({ id: el.id, kind: "player", team: player.team, label: player.label, x: p.x, y: p.y });
    } else if (el.type === "coach") {
      hadCoach = true;
      pieces.push({ id: el.id, kind: "feeder", x: p.x, y: p.y });
    } else if (el.type === "cone") {
      pieces.push({ id: el.id, kind: "cone", x: p.x, y: p.y });
    } else if (el.type === "ball") {
      pieces.push({ id: el.id, kind: "ball", x: p.x, y: p.y });
    }
    // blocker: dropped — the canvas has no such piece.
  }

  const steps: Step[] = [];
  const movementsForFirstStep: Step["movements"] = [];
  for (const el of elements) {
    if (el.endX == null || el.endY == null) continue;
    const from = legacyToPercent({ x: el.x, y: el.y });
    const to = legacyToPercent({ x: el.endX, y: el.endY });
    if (el.type === "arrow") {
      steps.push({
        id: newPieceId("s"),
        ball: { from, to, style: Math.abs(el.curve ?? 0) >= 2 ? "lob" : "flat" },
        movements: [],
      });
    } else if (el.type === "movement") {
      const player = nearestPlayer(pieces, from);
      if (player) movementsForFirstStep.push({ pieceId: player.id, to });
    }
  }
  if (movementsForFirstStep.length > 0) {
    if (steps.length === 0) steps.push({ id: newPieceId("s"), movements: [] });
    steps[0] = { ...steps[0], movements: [...steps[0].movements, ...movementsForFirstStep] };
  }

  if (pieces.length === 0 && steps.length === 0) return newDiagram("game");
  return { version: 2, mode: hadCoach ? "basket" : "game", pieces, steps };
}

/**
 * Whatever the API returned (v1, v2 or nothing) → a v2 diagram. A v2 input is
 * returned as-is (same reference) so callers can skip a no-op save.
 */
export function upgradeCourtDiagram(diagram: AnyCourtDiagram | null | undefined): CourtDiagramV2 {
  if (!diagram) return newDiagram("game");
  if (isV2(diagram)) return diagram;
  return upgradeLegacy(diagram.elements ?? []);
}

/** True when the diagram is exactly a fresh game board — nothing worth saving. */
export function isPristineGameDiagram(d: CourtDiagramV2): boolean {
  if (d.mode !== "game" || d.steps.length > 0 || d.pieces.length !== GAME_START_POSITION.length) return false;
  return d.pieces.every((p, i) => {
    const s = GAME_START_POSITION[i];
    return p.kind === "player" && s.kind === "player" && p.id === s.id && p.x === s.x && p.y === s.y;
  });
}
