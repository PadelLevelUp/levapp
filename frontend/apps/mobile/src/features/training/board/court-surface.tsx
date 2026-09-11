import {
  ballPathD,
  ballPathMidpoint,
  BOUNDARY_INSET,
  COURT_COLORS,
  movementPathD,
  NET_Y,
  PLAYER_RADIUS,
  SERVICE_LINES_Y,
  stepBalls,
  swatchHex as swatch,
  toView,
  type PendingPath,
  VIEW_H,
  VIEW_W,
} from "@levelup/config";
import type { CourtDiagramV2, Piece, PieceColor, Point } from "@levelup/types";
import * as React from "react";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

/**
 * react-native-svg port of apps/web/src/components/training/board/CourtSurface.tsx.
 * Same viewBox, same geometry constants, same colours — diagrams are shared
 * data, so the two must draw identically. Pure: the board owns interaction
 * state and passes the live bits (selection, drag, pending path) in.
 *
 * Text weights come from the family (`fontFamily`), never `fontWeight` (R-025).
 */

export interface CourtSurfaceProps {
  diagram: CourtDiagramV2;
  stepIndex?: number;
  selectedId?: string | null;
  dragOverride?: { id: string; position: Point } | null;
  pending?: PendingPath | null;
  /** A pen stroke still under the finger (Magnético). */
  liveStroke?: { color: PieceColor; points: Point[] } | null;
  /** The ball mid-flight during Passo / ▶ AUTO (rule 20). */
  playbackBall?: Point | null;
  /** Thumbnail mode: no handle, no endpoint squares, hairline strokes. */
  compact?: boolean;
  width: number;
  height: number;
  testID?: string;
}

const inset = { x: (VIEW_W * BOUNDARY_INSET) / 100, y: (VIEW_H * BOUNDARY_INSET) / 100 };
const LABEL_FONT = "PlusJakartaSans_700Bold";
const CAPTION_FONT = "PlusJakartaSans_600SemiBold";

export function CourtSurface({
  diagram,
  stepIndex = 0,
  selectedId,
  dragOverride,
  pending,
  liveStroke,
  playbackBall,
  compact = false,
  width,
  height,
  testID = "court-surface",
}: CourtSurfaceProps) {
  const step = diagram.steps[stepIndex];
  const gradientId = compact ? "court-gradient-compact" : "court-gradient";
  // Thumbnails in the list must not collide with the board's test ids (Maestro matches by id).
  const tid = (name: string) => (compact ? `thumb-${name}` : name);

  const position = (piece: Piece): Point | null => {
    if (piece.kind === "stroke") return null;
    if (dragOverride && dragOverride.id === piece.id) return dragOverride.position;
    return { x: piece.x, y: piece.y };
  };
  const pieceById = (id: string) => diagram.pieces.find((p) => p.id === id);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" testID={testID}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={COURT_COLORS.surfaceTop} />
          <Stop offset="1" stopColor={COURT_COLORS.surfaceBottom} />
        </LinearGradient>
      </Defs>

      <Rect x={0} y={0} width={VIEW_W} height={VIEW_H} rx={3} fill={`url(#${gradientId})`} stroke="rgba(255,255,255,0.9)" strokeWidth={1} />
      <Rect x={inset.x} y={inset.y} width={VIEW_W - inset.x * 2} height={VIEW_H - inset.y * 2} fill="none" stroke={COURT_COLORS.line} strokeWidth={1.5} />
      <Line x1={VIEW_W / 2} y1={inset.y} x2={VIEW_W / 2} y2={VIEW_H - inset.y} stroke={COURT_COLORS.line} strokeWidth={1.5} />
      {SERVICE_LINES_Y.map((y) => (
        <Line key={y} x1={inset.x} y1={(VIEW_H * y) / 100} x2={VIEW_W - inset.x} y2={(VIEW_H * y) / 100} stroke={COURT_COLORS.line} strokeWidth={1.5} />
      ))}
      <Line x1={0} y1={(VIEW_H * NET_Y) / 100 - 2} x2={VIEW_W} y2={(VIEW_H * NET_Y) / 100 - 2} stroke={COURT_COLORS.net} strokeWidth={1.5} />
      <Line x1={0} y1={(VIEW_H * NET_Y) / 100 + 2} x2={VIEW_W} y2={(VIEW_H * NET_Y) / 100 + 2} stroke={COURT_COLORS.net} strokeWidth={1.5} />

      {diagram.pieces.map((piece) =>
        piece.kind === "stroke" && piece.points.length > 1 ? (
          <Polyline
            key={piece.id}
            testID={tid(`piece-${piece.id}`)}
            points={piece.points
              .map((p) => {
                const v = toView(p);
                return `${v.x},${v.y}`;
              })
              .join(" ")}
            fill="none"
            stroke={swatch(piece.color)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null
      )}

      {liveStroke && liveStroke.points.length > 1 ? (
        <Polyline
          points={liveStroke.points
            .map((p) => {
              const v = toView(p);
              return `${v.x},${v.y}`;
            })
            .join(" ")}
          fill="none"
          stroke={swatch(liveStroke.color)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      ) : null}

      {step?.movements.map((m) => {
        const piece = pieceById(m.pieceId);
        const from = piece ? position(piece) : null;
        if (!from) return null;
        const end = toView(m.to);
        return (
          <G key={`mv-${m.pieceId}`} testID={tid(`movement-${m.pieceId}`)}>
            <Path d={movementPathD(from, m.to)} fill="none" stroke={COURT_COLORS.movement} strokeWidth={compact ? 1.5 : 2} strokeDasharray="6 5" strokeLinecap="round" />
            <Circle cx={end.x} cy={end.y} r={compact ? 2.5 : 4} fill={COURT_COLORS.movement} />
          </G>
        );
      })}

      {/* ball paths, in order (PAD-289, rules 9, 13, 23) */}
      {stepBalls(step).map((path, index, all) => {
        const suffix = index === 0 ? "" : `-${index}`;
        const startV = toView(path.from);
        return (
          <G key={`ball-${index}`}>
            <Path
              testID={tid(index === 0 ? `ball-path-${path.style}` : `ball-path-${index}-${path.style}`)}
              d={ballPathD(path)}
              fill="none"
              stroke={COURT_COLORS.ballPath}
              strokeWidth={compact ? 1.5 : 2}
              strokeLinecap="round"
            />
            {!compact ? (
              <>
                <Waypoint at={path.from} />
                <Waypoint at={path.to} />
              </>
            ) : null}
            <BallDot at={path.from} />
            {all.length > 1 && !compact ? (
              <G testID={`ball-number-${index}`} x={startV.x + 13} y={startV.y - 24}>
                <Circle r={8} fill={COURT_COLORS.ballPath} stroke={COURT_COLORS.frame} strokeWidth={1.5} />
                <SvgText textAnchor="middle" y={3.5} fontSize={9} fontWeight="700" fill="#fff">
                  {index + 1}
                </SvgText>
              </G>
            ) : null}
            {!compact ? <BallHandle at={ballPathMidpoint(path)} lob={path.style === "lob"} testID={`ball-style-handle${suffix}`} /> : null}
          </G>
        );
      })}

      {playbackBall ? (
        <Circle testID="playback-ball" cx={toView(playbackBall).x} cy={toView(playbackBall).y} r={6.5} fill={COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} />
      ) : null}

      {pending ? (
        <G>
          {pending.to ? (
            <Path
              d={pending.kind === "ball" ? ballPathD({ from: pending.from, to: pending.to, style: "flat" }) : movementPathD(pending.from, pending.to)}
              fill="none"
              stroke={pending.kind === "ball" ? COURT_COLORS.ballPath : COURT_COLORS.movement}
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          ) : null}
          <Waypoint at={pending.from} />
        </G>
      ) : null}

      {diagram.pieces.map((piece) => {
        const pos = position(piece);
        if (!pos) return null;
        const v = toView(pos);
        return (
          <G key={piece.id} testID={tid(`piece-${piece.id}`)} x={v.x} y={v.y}>
            {selectedId === piece.id ? <Circle r={PLAYER_RADIUS + 5} fill="none" stroke={COURT_COLORS.selection} strokeWidth={2} /> : null}
            <PieceShape piece={piece} compact={compact} />
          </G>
        );
      })}
    </Svg>
  );
}

function PieceShape({ piece, compact }: { piece: Piece; compact: boolean }) {
  switch (piece.kind) {
    case "player": {
      const fill = piece.team === "A" ? COURT_COLORS.teamA : COURT_COLORS.teamB;
      const text = piece.team === "A" ? COURT_COLORS.teamAText : COURT_COLORS.teamBText;
      return (
        <>
          <Circle r={PLAYER_RADIUS} fill={fill} />
          <SvgText textAnchor="middle" y={compact ? 3.5 : 4} fontSize={compact ? 10 : 11} fontFamily={LABEL_FONT} fill={text}>
            {piece.label}
          </SvgText>
        </>
      );
    }
    case "feeder":
      return (
        <>
          <Rect x={-14} y={-14} width={28} height={28} rx={8} fill={COURT_COLORS.amber} />
          <Path d="M-6,-3 h12 l-1.5,9 h-9 z M-3,-3 v-1.5 a3,3 0 0 1 6,0 v1.5" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          {!compact ? (
            <SvgText y={26} textAnchor="middle" fontSize={8} fontFamily={CAPTION_FONT} letterSpacing={0.5} fill="rgba(255,255,255,0.7)">
              ALIMENTADOR
            </SvgText>
          ) : null}
        </>
      );
    case "cone":
      return <Polygon points="0,-10 8,8 -8,8" fill={piece.color ? swatch(piece.color) : COURT_COLORS.amber} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />;
    case "ball":
      return <Circle r={6.5} fill={piece.color ? swatch(piece.color) : COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} />;
    default:
      return null;
  }
}

function Waypoint({ at }: { at: Point }) {
  const v = toView(at);
  return <Rect x={v.x - 5} y={v.y - 5} width={10} height={10} fill="#fff" stroke={COURT_COLORS.ballPath} strokeWidth={2} />;
}

function BallDot({ at }: { at: Point }) {
  const v = toView(at);
  return <Circle cx={v.x} cy={v.y - 14} r={6.5} fill={COURT_COLORS.amber} stroke={COURT_COLORS.frame} strokeWidth={2} />;
}

function BallHandle({ at, lob, testID = "ball-style-handle" }: { at: Point; lob: boolean; testID?: string }) {
  const v = toView(at);
  return (
    <G x={v.x} y={v.y} testID={testID}>
      <Circle r={lob ? 12 : 10} fill="none" stroke={COURT_COLORS.ballPath} strokeWidth={lob ? 3 : 1} />
      <Circle r={9} fill="#fff" stroke={COURT_COLORS.frame} strokeWidth={2} />
    </G>
  );
}
