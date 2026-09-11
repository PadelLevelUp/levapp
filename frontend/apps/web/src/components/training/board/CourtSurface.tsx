import { forwardRef } from "react";
import type { CourtDiagramV2, Piece, PieceColor, Point } from "@/types/training";
import {
  BOUNDARY_INSET,
  COURT_COLORS,
  NET_Y,
  PLAYER_RADIUS,
  SERVICE_LINES_Y,
  VIEW_H,
  VIEW_W,
  ballPathD,
  ballPathMidpoint,
  movementPathD,
  swatchHex as swatch,
  toView, stepBalls } from "@levelup/config";
import { cn } from "@/lib/utils";

/** A path being drawn: first point placed, second one following the pointer. */
export interface PendingPath {
  kind: "ball" | "movement";
  from: Point;
  to?: Point;
}

export interface CourtSurfaceProps {
  diagram: CourtDiagramV2;
  /** Which step's ball path and movements to draw (wave 1 only ever has step 0). */
  stepIndex?: number;
  selectedId?: string | null;
  /** Live override of a piece position while it is being dragged. */
  dragOverride?: { id: string; position: Point } | null;
  pending?: PendingPath | null;
  /** A pen stroke still under the pointer (Magnético). */
  liveStroke?: { color: PieceColor; points: Point[] } | null;
  /** The ball mid-flight during Passo / ▶ AUTO (rule 20). */
  playbackBall?: Point | null;
  /** Thumbnail mode: no handle, no endpoint squares, hairline strokes. */
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
  ballHandleLabel?: string;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPiecePointerDown?: (piece: Piece, e: React.PointerEvent<SVGGElement>) => void;
  onBallHandleClick?: (pathIndex: number) => void;
}

const vb = `0 0 ${VIEW_W} ${VIEW_H}`;
const inset = { x: (VIEW_W * BOUNDARY_INSET) / 100, y: (VIEW_H * BOUNDARY_INSET) / 100 };

/**
 * The playing surface as an SVG, shared by the tactical board and the exercise
 * card thumbnail. Pure: everything it draws comes from the diagram; the board
 * owns interaction state and passes the live bits (selection, drag, pending
 * path) in as props. Colours are diagram content — see COURT_COLORS.
 */
export const CourtSurface = forwardRef<SVGSVGElement, CourtSurfaceProps>(function CourtSurface(
  {
    diagram,
    stepIndex = 0,
    selectedId,
    dragOverride,
    pending,
    liveStroke,
    playbackBall,
    compact = false,
    className,
    ariaLabel,
    ballHandleLabel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPiecePointerDown,
    onBallHandleClick,
  },
  ref
) {
  const step = diagram.steps[stepIndex];
  const gradientId = compact ? "court-gradient-compact" : "court-gradient";
  // Thumbnails on the list page must not collide with the board's test ids.
  const tid = (name: string) => (compact ? `thumb-${name}` : name);

  const position = (piece: Piece): Point | null => {
    if (piece.kind === "stroke") return null;
    if (dragOverride && dragOverride.id === piece.id) return dragOverride.position;
    return { x: piece.x, y: piece.y };
  };

  const pieceById = (id: string) => diagram.pieces.find((p) => p.id === id);

  return (
    <svg
      ref={ref}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      role={compact ? "img" : "application"}
      aria-label={ariaLabel}
      data-testid={tid("court-surface")}
      className={cn("block w-full h-auto touch-none select-none overflow-visible", className)}
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={COURT_COLORS.surfaceTop} />
          <stop offset="1" stopColor={COURT_COLORS.surfaceBottom} />
        </linearGradient>
      </defs>

      {/* surface + outer ring */}
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} rx={3} fill={`url(#${gradientId})`} stroke="rgba(255,255,255,0.9)" strokeWidth={1} />
      {/* boundary */}
      <rect x={inset.x} y={inset.y} width={VIEW_W - inset.x * 2} height={VIEW_H - inset.y * 2} fill="none" stroke={COURT_COLORS.line} strokeWidth={1.5} />
      {/* centre line */}
      <line x1={VIEW_W / 2} y1={inset.y} x2={VIEW_W / 2} y2={VIEW_H - inset.y} stroke={COURT_COLORS.line} strokeWidth={1.5} />
      {/* service lines */}
      {SERVICE_LINES_Y.map((y) => (
        <line key={y} x1={inset.x} y1={(VIEW_H * y) / 100} x2={VIEW_W - inset.x} y2={(VIEW_H * y) / 100} stroke={COURT_COLORS.line} strokeWidth={1.5} />
      ))}
      {/* net: a double line across the full width */}
      <line x1={-6} y1={(VIEW_H * NET_Y) / 100 - 2} x2={VIEW_W + 6} y2={(VIEW_H * NET_Y) / 100 - 2} stroke={COURT_COLORS.net} strokeWidth={1.5} />
      <line x1={-6} y1={(VIEW_H * NET_Y) / 100 + 2} x2={VIEW_W + 6} y2={(VIEW_H * NET_Y) / 100 + 2} stroke={COURT_COLORS.net} strokeWidth={1.5} />

      {/* pen strokes sit under everything else */}
      {diagram.pieces.map((piece) =>
        piece.kind === "stroke" && piece.points.length > 1 ? (
          <polyline
            key={piece.id}
            data-testid={tid(`piece-${piece.id}`)}
            points={piece.points.map((p) => {
              const v = toView(p);
              return `${v.x},${v.y}`;
            }).join(" ")}
            fill="none"
            stroke={swatch(piece.color)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null
      )}

      {liveStroke && liveStroke.points.length > 1 ? (
        <polyline
          data-testid="live-stroke"
          points={liveStroke.points.map((p) => {
            const v = toView(p);
            return `${v.x},${v.y}`;
          }).join(" ")}
          fill="none"
          stroke={swatch(liveStroke.color)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
          pointerEvents="none"
        />
      ) : null}

      {/* movements (dashed) */}
      {step?.movements.map((m) => {
        const piece = pieceById(m.pieceId);
        const from = piece ? position(piece) : null;
        if (!from) return null;
        const end = toView(m.to);
        return (
          <g key={`mv-${m.pieceId}`}>
            <path data-testid={tid(`movement-${m.pieceId}`)} d={movementPathD(from, m.to)} fill="none" stroke={COURT_COLORS.movement} strokeWidth={compact ? 1.5 : 2} strokeDasharray="6 5" strokeLinecap="round" />
            <circle cx={end.x} cy={end.y} r={compact ? 2.5 : 4} fill={COURT_COLORS.movement} />
          </g>
        );
      })}

      {/* ball paths, in order (PAD-289, rules 9, 13, 23) */}
      {stepBalls(step).map((path, index, all) => (
        <BallPathLayer
          key={`ball-${index}`}
          path={path}
          index={index}
          numbered={all.length > 1}
          compact={compact}
          tid={tid}
          handleLabel={ballHandleLabel}
          onHandleClick={onBallHandleClick ? () => onBallHandleClick(index) : undefined}
        />
      ))}

      {playbackBall ? (
        <circle data-testid="playback-ball" cx={toView(playbackBall).x} cy={toView(playbackBall).y} r={6.5} fill={COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} pointerEvents="none" />
      ) : null}

      {/* pending path preview */}
      {pending ? (
        <g pointerEvents="none">
          {pending.to ? (
            <path
              d={pending.kind === "ball" ? ballPathD({ from: pending.from, to: pending.to, style: "flat" }) : movementPathD(pending.from, pending.to)}
              fill="none"
              stroke={pending.kind === "ball" ? COURT_COLORS.ballPath : COURT_COLORS.movement}
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          ) : null}
          <Waypoint at={pending.from} />
        </g>
      ) : null}

      {/* positioned pieces */}
      {diagram.pieces.map((piece) => {
        const pos = position(piece);
        if (!pos) return null;
        const v = toView(pos);
        const selected = selectedId === piece.id;
        return (
          <g
            key={piece.id}
            data-testid={tid(`piece-${piece.id}`)}
            data-piece-id={piece.id}
            transform={`translate(${v.x} ${v.y})`}
            className={onPiecePointerDown ? "cursor-pointer" : undefined}
            onPointerDown={onPiecePointerDown ? (e) => onPiecePointerDown(piece, e) : undefined}
          >
            {selected ? <circle r={PLAYER_RADIUS + 5} fill="none" stroke={COURT_COLORS.selection} strokeWidth={2} /> : null}
            <PieceShape piece={piece} compact={compact} />
          </g>
        );
      })}
    </svg>
  );
});

function PieceShape({ piece, compact }: { piece: Piece; compact: boolean }) {
  switch (piece.kind) {
    case "player": {
      const fill = piece.team === "A" ? COURT_COLORS.teamA : COURT_COLORS.teamB;
      const text = piece.team === "A" ? COURT_COLORS.teamAText : COURT_COLORS.teamBText;
      return (
        <>
          <circle r={PLAYER_RADIUS} fill={fill} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={compact ? 10 : 11} fontWeight={700} fill={text} style={{ pointerEvents: "none" }}>
            {piece.label}
          </text>
        </>
      );
    }
    case "feeder":
      return (
        <>
          <rect x={-14} y={-14} width={28} height={28} rx={8} fill={COURT_COLORS.amber} />
          {/* basket */}
          <path d="M-6,-3 h12 l-1.5,9 h-9 z M-3,-3 v-1.5 a3,3 0 0 1 6,0 v1.5" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          {!compact ? (
            <text y={26} textAnchor="middle" fontSize={8} fontWeight={600} letterSpacing={0.5} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: "none" }}>
              ALIMENTADOR
            </text>
          ) : null}
        </>
      );
    case "cone":
      return <polygon points="0,-10 8,8 -8,8" fill={piece.color ? swatch(piece.color) : COURT_COLORS.amber} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />;
    case "ball":
      return <circle r={6.5} fill={piece.color ? swatch(piece.color) : COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} />;
    default:
      return null;
  }
}

function Waypoint({ at }: { at: Point }) {
  const v = toView(at);
  return <rect x={v.x - 5} y={v.y - 5} width={10} height={10} fill="#fff" stroke={COURT_COLORS.ballPath} strokeWidth={2} />;
}

function BallPathLayer({
  path,
  index,
  numbered,
  compact,
  tid,
  handleLabel,
  onHandleClick,
}: {
  path: NonNullable<CourtDiagramV2["steps"][number]["ball"]>;
  /** Position in the step's ordered paths; the first keeps the un-suffixed test ids. */
  index: number;
  /** Show the 1-based number at the path's start (rule 23: only when a step has several). */
  numbered: boolean;
  compact: boolean;
  tid: (name: string) => string;
  handleLabel?: string;
  onHandleClick?: () => void;
}) {
  const from = toView(path.from);
  const mid = toView(ballPathMidpoint(path));
  const lob = path.style === "lob";
  const suffix = index === 0 ? "" : `-${index}`;
  return (
    <g data-index={index}>
      <path data-testid={tid(`ball-path${suffix}`)} data-style={path.style} d={ballPathD(path)} fill="none" stroke={COURT_COLORS.ballPath} strokeWidth={compact ? 1.5 : 2} strokeLinecap="round" />
      {numbered && !compact ? (
        <g data-testid={`ball-number-${index}`} transform={`translate(${from.x + 13} ${from.y - 24})`} pointerEvents="none">
          <circle r={8} fill={COURT_COLORS.ballPath} stroke={COURT_COLORS.frame} strokeWidth={1.5} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#fff">{index + 1}</text>
        </g>
      ) : null}
      {!compact ? (
        <>
          <Waypoint at={path.from} />
          <Waypoint at={path.to} />
        </>
      ) : null}
      <circle cx={from.x} cy={from.y - 14} r={6.5} fill={COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} />
      {!compact ? (
        <g
          data-testid={`ball-style-handle${suffix}`}
          role="button"
          aria-label={handleLabel}
          tabIndex={0}
          className="cursor-pointer"
          transform={`translate(${mid.x} ${mid.y})`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onHandleClick?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onHandleClick?.();
            }
          }}
        >
          <circle r={lob ? 12 : 10} fill="none" stroke={COURT_COLORS.ballPath} strokeWidth={lob ? 3 : 1} />
          <circle r={9} fill="#fff" stroke={COURT_COLORS.frame} strokeWidth={2} />
        </g>
      ) : null}
    </g>
  );
}
