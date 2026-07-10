import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type {
  CourtDiagram,
  CourtElement,
  CourtElementType,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Defs, G, Line, Marker, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Mobile port of apps/web/src/components/training/CourtDiagramEditor.tsx.
 * Court geometry, element rendering and the curve/bezier math are ported
 * near-verbatim; the interaction model is re-architected for touch (see
 * README notes in the final report) — one canvas-level Pan gesture drives
 * hit-testing in JS rather than N per-element DOM pointer listeners, since
 * that's what web's own pointerdown/pointermove/pointerup model reduces to
 * once you can't rely on the DOM to resolve `e.target` for you.
 */

// Padel court: 10m wide x 20m long → 240 x 480 SVG units (ratio 1:2).
// MUST match web exactly — diagrams are shared across platforms.
const COURT_W = 240;
const COURT_H = 480;
const PADDING = 20;
const VB_W = COURT_W + PADDING * 2;
const VB_H = COURT_H + PADDING * 2;

// Service line distance from back wall: ~6.95m → ~167 units
const SERVICE_LINE = 167;

// Cap on-screen height like web's `maxHeight: 520px`. Unlike web (where the
// court's CSS width rarely approaches 280px on desktop), mobile form widths
// routinely exceed 280pt, so this cap engages far more often — see the
// aspect-fit ("meet") coordinate mapping below, which handles the resulting
// letterboxing.
const MAX_BOX_HEIGHT = 520;
const DEFAULT_BOX_HEIGHT = 260;

// Minimum effective touch radius (half of the recommended ~44pt touch
// target), converted to SVG units at render time via the current scale.
const MIN_TOUCH_RADIUS_PX = 22;

const PLAYER_COLORS: Record<string, string> = {
  player_1: "#3b82f6",
  player_2: "#ef4444",
  player_3: "#22c55e",
  player_4: "#a855f7",
  coach: "#f59e0b",
};

const PLAYER_LABELS: Record<string, string> = {
  player_1: "P1",
  player_2: "P2",
  player_3: "P3",
  player_4: "P4",
  coach: "C",
};

// Base visual radius (svg units) per point-element type, used as a floor
// for hit-testing (the actual hit radius is max(this, minTouchRadius)).
const ELEMENT_RADIUS: Record<string, number> = {
  player_1: 14,
  player_2: 14,
  player_3: 14,
  player_4: 14,
  coach: 14,
  cone: 10,
  ball: 6,
};

const MAX_PLAYERS = 4;

type Tool =
  | "select"
  | "player_1"
  | "player_2"
  | "player_3"
  | "player_4"
  | "coach"
  | "cone"
  | "blocker"
  | "ball"
  | "arrow"
  | "movement"
  | "eraser";

const PLAYER_TYPES = ["player_1", "player_2", "player_3", "player_4"] as const;

function isPlayerTool(tool: Tool): tool is (typeof PLAYER_TYPES)[number] {
  return (PLAYER_TYPES as readonly string[]).includes(tool);
}

const TOOLS: {
  tool: Tool;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  color?: string;
}[] = [
  { tool: "select", icon: "hand-left-outline", labelKey: "training.diagram.tools.select" },
  { tool: "player_1", icon: "person", labelKey: "training.diagram.tools.player1", color: PLAYER_COLORS.player_1 },
  { tool: "player_2", icon: "person", labelKey: "training.diagram.tools.player2", color: PLAYER_COLORS.player_2 },
  { tool: "player_3", icon: "person", labelKey: "training.diagram.tools.player3", color: PLAYER_COLORS.player_3 },
  { tool: "player_4", icon: "person", labelKey: "training.diagram.tools.player4", color: PLAYER_COLORS.player_4 },
  { tool: "coach", icon: "school-outline", labelKey: "training.diagram.tools.coach", color: PLAYER_COLORS.coach },
  { tool: "cone", icon: "triangle-outline", labelKey: "training.diagram.tools.cone" },
  { tool: "blocker", icon: "square-outline", labelKey: "training.diagram.tools.blocker" },
  { tool: "ball", icon: "ellipse-outline", labelKey: "training.diagram.tools.ball" },
  { tool: "arrow", icon: "arrow-forward-outline", labelKey: "training.diagram.tools.arrow" },
  { tool: "movement", icon: "footsteps-outline", labelKey: "training.diagram.tools.movement" },
  { tool: "eraser", icon: "trash-outline", labelKey: "training.diagram.tools.eraser" },
];

/** Compute quadratic bezier control point from curve offset. Ported verbatim from web. */
function getControlPoint(x1: number, y1: number, x2: number, y2: number, curve: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  return { cx: mx + px * curve, cy: my + py * curve };
}

/** Build SVG path for a quadratic bezier arrow. Ported verbatim from web. */
function bezierPath(x1: number, y1: number, x2: number, y2: number, curve: number) {
  if (Math.abs(curve) < 2) {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const { cx, cy } = getControlPoint(x1, y1, x2, y2, curve);
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/** Get midpoint on the bezier for label/curve-handle placement. Ported verbatim from web. */
function bezierMidpoint(x1: number, y1: number, x2: number, y2: number, curve: number) {
  if (Math.abs(curve) < 2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const { cx, cy } = getControlPoint(x1, y1, x2, y2, curve);
  return {
    x: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
    y: 0.25 * y1 + 0.5 * cy + 0.25 * y2,
  };
}

/** Point on the quadratic bezier at parameter t — used for line hit-testing (no DOM getPointAtLength on RN). */
function bezierPointAt(x1: number, y1: number, x2: number, y2: number, curve: number, t: number) {
  if (Math.abs(curve) < 2) {
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  }
  const { cx, cy } = getControlPoint(x1, y1, x2, y2, curve);
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from point p to segment [a,b]. */
function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

let idCounter = 0;
/** Local element id generator — no `crypto.randomUUID` / uuid package available on Hermes/RN here. */
function generateId() {
  idCounter += 1;
  return `el_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

type Interaction =
  | { kind: "drag"; id: string; offsetX: number; offsetY: number }
  | { kind: "line" }
  | { kind: "endpoint"; id: string; point: "start" | "end" }
  | { kind: "curve"; id: string };

type LivePoint = { x: number; y: number } | null;

/** Everything the gesture callbacks need, mirrored into a ref every render so the
 * Gesture object itself can be built once (via useMemo) without going stale. */
type Live = {
  tool: Tool;
  elements: CourtElement[];
  selectedId: string | null;
  lineStart: LivePoint;
  linePreview: LivePoint;
  scale: number;
  offsetX: number;
  offsetY: number;
  minHitRadius: number;
  onChange: (diagram: CourtDiagram) => void;
};

interface Props {
  value: CourtDiagram;
  onChange: (diagram: CourtDiagram) => void;
}

export function CourtDiagramEditor({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [tool, setTool] = React.useState<Tool>("select");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [lineStart, setLineStart] = React.useState<LivePoint>(null);
  const [linePreview, setLinePreview] = React.useState<LivePoint>(null);
  const [layoutWidth, setLayoutWidth] = React.useState(0);

  const elements = value.elements;
  const selectedEl = selectedId ? elements.find((el) => el.id === selectedId) ?? null : null;
  const isLineSelected = selectedEl?.type === "arrow" || selectedEl?.type === "movement";

  const boxHeight = layoutWidth > 0 ? Math.min(layoutWidth * (VB_H / VB_W), MAX_BOX_HEIGHT) : DEFAULT_BOX_HEIGHT;
  // Aspect-fit ("meet") mapping: the rendered box's aspect ratio doesn't
  // always match the viewBox's (see MAX_BOX_HEIGHT comment above), so we
  // replicate SVG's default preserveAspectRatio="xMidYMid meet" ourselves
  // to translate touch coordinates correctly even when letterboxed.
  const scale = layoutWidth > 0 ? Math.min(layoutWidth / VB_W, boxHeight / VB_H) : 0;
  const renderedW = VB_W * scale;
  const renderedH = VB_H * scale;
  const offsetX = (layoutWidth - renderedW) / 2;
  const offsetY = (boxHeight - renderedH) / 2;
  const minHitRadius = scale > 0 ? MIN_TOUCH_RADIUS_PX / scale : 20;

  const playerCount = elements.filter((el) => isPlayerTool(el.type as Tool)).length;

  function isToolDisabled(toolItem: Tool) {
    if (isPlayerTool(toolItem) && elements.some((el) => el.type === toolItem)) return true;
    if (toolItem === "coach" && elements.some((el) => el.type === "coach")) return true;
    return false;
  }

  const live = React.useRef<Live>({
    tool,
    elements,
    selectedId,
    lineStart,
    linePreview,
    scale,
    offsetX,
    offsetY,
    minHitRadius,
    onChange,
  });
  live.current = {
    tool,
    elements,
    selectedId,
    lineStart,
    linePreview,
    scale,
    offsetX,
    offsetY,
    minHitRadius,
    onChange,
  };

  const interactionRef = React.useRef<Interaction | null>(null);

  const toSvgPoint = React.useCallback((localX: number, localY: number) => {
    const { scale: s, offsetX: ox, offsetY: oy } = live.current;
    if (s <= 0) return { x: 0, y: 0 };
    return { x: (localX - ox) / s, y: (localY - oy) / s };
  }, []);

  function elementContainsPoint(el: CourtElement, pt: { x: number; y: number }, minHit: number): boolean {
    if (el.type === "arrow" || el.type === "movement") {
      const x2 = el.endX ?? el.x;
      const y2 = el.endY ?? el.y;
      const curve = el.curve ?? 0;
      const threshold = Math.max(7, minHit);
      const steps = 16;
      let prev = bezierPointAt(el.x, el.y, x2, y2, curve, 0);
      let best = Infinity;
      for (let s = 1; s <= steps; s++) {
        const cur = bezierPointAt(el.x, el.y, x2, y2, curve, s / steps);
        best = Math.min(best, distToSegment(pt, prev, cur));
        prev = cur;
      }
      return best <= threshold;
    }
    if (el.type === "blocker") {
      const halfW = Math.max(15, minHit);
      const halfH = Math.max(5, minHit);
      return Math.abs(pt.x - el.x) <= halfW && Math.abs(pt.y - el.y) <= halfH;
    }
    const r = ELEMENT_RADIUS[el.type] ?? 12;
    return dist(pt, el) <= Math.max(r, minHit);
  }

  function hitTestElement(elements: CourtElement[], pt: { x: number; y: number }, minHit: number): CourtElement | null {
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elementContainsPoint(elements[i], pt, minHit)) return elements[i];
    }
    return null;
  }

  function hitTestLineControls(
    el: CourtElement,
    pt: { x: number; y: number },
    minHit: number
  ): "curve" | "start" | "end" | null {
    const x2 = el.endX ?? el.x;
    const y2 = el.endY ?? el.y;
    const curve = el.curve ?? 0;
    const mid = bezierMidpoint(el.x, el.y, x2, y2, curve);
    const r = Math.max(6, minHit);
    if (dist(pt, mid) <= r) return "curve";
    if (dist(pt, { x: el.x, y: el.y }) <= r) return "start";
    if (dist(pt, { x: x2, y: y2 }) <= r) return "end";
    return null;
  }

  const handleDown = React.useCallback((pt: { x: number; y: number }) => {
    const { tool: curTool, elements: els, selectedId: curSelectedId, minHitRadius: minHit, onChange: change } = live.current;
    const curSelectedEl = curSelectedId ? els.find((el) => el.id === curSelectedId) ?? null : null;

    if (curSelectedEl && curTool === "select" && (curSelectedEl.type === "arrow" || curSelectedEl.type === "movement")) {
      const hitControl = hitTestLineControls(curSelectedEl, pt, minHit);
      if (hitControl === "curve") {
        interactionRef.current = { kind: "curve", id: curSelectedEl.id };
        return;
      }
      if (hitControl === "start" || hitControl === "end") {
        interactionRef.current = { kind: "endpoint", id: curSelectedEl.id, point: hitControl };
        return;
      }
    }

    const hitEl = hitTestElement(els, pt, minHit);

    if (curTool === "eraser") {
      if (hitEl) {
        change({ elements: els.filter((el) => el.id !== hitEl.id) });
        if (curSelectedId === hitEl.id) setSelectedId(null);
      }
      interactionRef.current = null;
      return;
    }

    if (hitEl) {
      // Matches web: elements always stopPropagation on pointerdown, so
      // pressing an existing element with a placement tool active is a
      // no-op rather than creating a new element underneath it.
      if (curTool === "select") {
        if (hitEl.type === "arrow" || hitEl.type === "movement") {
          setSelectedId(hitEl.id);
        } else {
          setSelectedId(hitEl.id);
          interactionRef.current = {
            kind: "drag",
            id: hitEl.id,
            offsetX: pt.x - hitEl.x,
            offsetY: pt.y - hitEl.y,
          };
        }
      }
      return;
    }

    if (curTool === "arrow" || curTool === "movement") {
      setLineStart(pt);
      setLinePreview(pt);
      interactionRef.current = { kind: "line" };
      return;
    }

    if (curTool === "select") {
      setSelectedId(null);
      return;
    }

    if (isPlayerTool(curTool)) {
      if (playerCountFrom(els) >= MAX_PLAYERS) return;
      if (els.some((el) => el.type === curTool)) return;
    }
    if (curTool === "coach" && els.some((el) => el.type === "coach")) return;

    const newEl: CourtElement = {
      id: generateId(),
      type: curTool as CourtElementType,
      x: pt.x,
      y: pt.y,
      label: PLAYER_LABELS[curTool as string],
    };
    change({ elements: [...els, newEl] });
    setSelectedId(newEl.id);
    setTool("select");
  }, []);

  const handleMove = React.useCallback((pt: { x: number; y: number }) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const { elements: els, onChange: change } = live.current;

    switch (interaction.kind) {
      case "drag": {
        change({
          elements: els.map((el) =>
            el.id === interaction.id ? { ...el, x: pt.x - interaction.offsetX, y: pt.y - interaction.offsetY } : el
          ),
        });
        return;
      }
      case "line": {
        setLinePreview(pt);
        return;
      }
      case "endpoint": {
        const updates = interaction.point === "start" ? { x: pt.x, y: pt.y } : { endX: pt.x, endY: pt.y };
        change({ elements: els.map((el) => (el.id === interaction.id ? { ...el, ...updates } : el)) });
        return;
      }
      case "curve": {
        const el = els.find((e) => e.id === interaction.id);
        if (!el || el.endX == null || el.endY == null) return;
        const mx = (el.x + el.endX) / 2;
        const my = (el.y + el.endY) / 2;
        const dx = el.endX - el.x;
        const dy = el.endY - el.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const curve = (pt.x - mx) * px + (pt.y - my) * py;
        change({
          elements: els.map((e) => (e.id === interaction.id ? { ...e, curve: Math.round(curve / 5) * 5 } : e)),
        });
        return;
      }
    }
  }, []);

  const handleUp = React.useCallback(() => {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction) return;

    if (interaction.kind === "line") {
      const { tool: curTool, elements: els, lineStart: start, linePreview: preview, onChange: change } = live.current;
      if (start && preview) {
        const dx = preview.x - start.x;
        const dy = preview.y - start.y;
        if (Math.hypot(dx, dy) > 5) {
          const newEl: CourtElement = {
            id: generateId(),
            type: curTool as CourtElementType,
            x: start.x,
            y: start.y,
            endX: preview.x,
            endY: preview.y,
            curve: 0,
          };
          change({ elements: [...els, newEl] });
          setSelectedId(newEl.id);
        }
      }
      setLineStart(null);
      setLinePreview(null);
    }
  }, []);

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => handleDown(toSvgPoint(e.x, e.y)))
        .onUpdate((e) => handleMove(toSvgPoint(e.x, e.y)))
        .onFinalize(() => handleUp()),
    [handleDown, handleMove, handleUp, toSvgPoint]
  );

  function updateSelectedElement(updates: Partial<CourtElement>) {
    if (!selectedId) return;
    onChange({ elements: elements.map((el) => (el.id === selectedId ? { ...el, ...updates } : el)) });
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    onChange({ elements: elements.filter((el) => el.id !== selectedId) });
    setSelectedId(null);
  }

  function handleClear() {
    onChange({ elements: [] });
    setSelectedId(null);
  }

  return (
    <View className="gap-2" testID="court-diagram-editor">
      <Label>{t("training.diagram.label")}</Label>

      {/* Toolbar */}
      <View className="flex-row flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TOOLS.map(({ tool: toolItem, icon, labelKey, color }) => {
          const disabled = isToolDisabled(toolItem);
          const label = t(labelKey);
          const active = tool === toolItem;
          return (
            <Pressable
              key={toolItem}
              testID={`diagram-palette-${toolItem}`}
              accessibilityLabel={label}
              role="button"
              disabled={disabled}
              onPress={() => setTool(toolItem)}
              className={cn(
                "h-11 w-11 items-center justify-center rounded-md",
                active ? "bg-primary" : "active:bg-accent",
                disabled && "opacity-40"
              )}
            >
              <Ionicons
                name={icon}
                size={18}
                color={active ? lightTheme.primaryForeground : color ?? lightTheme.foreground}
              />
            </Pressable>
          );
        })}

        <View className="flex-1" />

        {selectedId ? (
          <Pressable
            testID="diagram-delete"
            accessibilityLabel={t("training.diagram.deleteSelected")}
            role="button"
            onPress={handleDeleteSelected}
            className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons name="trash-outline" size={18} color={lightTheme.destructive} />
          </Pressable>
        ) : null}

        <Pressable
          testID="diagram-clear"
          accessibilityLabel={t("training.diagram.clearAll")}
          role="button"
          onPress={handleClear}
          className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="refresh-outline" size={18} color={lightTheme.foreground} />
        </Pressable>
      </View>

      {/* Line label editor */}
      {isLineSelected && selectedEl ? (
        <View className="gap-1.5 rounded-lg border border-border bg-muted/60 p-3">
          <Label className="text-xs">{t("training.diagram.lineLabel")}</Label>
          <Input
            testID="diagram-line-label"
            value={selectedEl.label ?? ""}
            onChangeText={(text) => updateSelectedElement({ label: text || undefined })}
            placeholder={t("training.diagram.lineLabelPlaceholder")}
            className="h-9 text-sm"
          />
          <Text className="text-xs text-muted-foreground">{t("training.diagram.curveHint")}</Text>
        </View>
      ) : null}

      {/* Court canvas */}
      <GestureDetector gesture={panGesture}>
        <View
          className="overflow-hidden rounded-lg"
          style={{ width: "100%", height: boxHeight, backgroundColor: "#0d3b1f" }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setLayoutWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
          }}
        >
          <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
            <Defs>
              <Marker id="arrowhead" markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <Polygon points="0 0, 10 3.5, 0 7" fill="white" />
              </Marker>
              <Marker id="arrowhead-dashed" markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <Polygon points="0 0, 10 3.5, 0 7" fill="#facc15" />
              </Marker>
              <Marker id="arrowhead-sel" markerWidth={10} markerHeight={7} refX={9} refY={3.5} orient="auto">
                <Polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8" />
              </Marker>
            </Defs>

            {/* Court background */}
            <Rect x={PADDING} y={PADDING} width={COURT_W} height={COURT_H} fill="#1a6b35" stroke="white" strokeWidth={2} rx={2} />

            {/* Net */}
            <Line x1={PADDING} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth={3} />

            {/* Service lines */}
            <Line x1={PADDING} y1={PADDING + SERVICE_LINE} x2={PADDING + COURT_W} y2={PADDING + SERVICE_LINE} stroke="white" strokeWidth={1.5} opacity={0.8} />
            <Line x1={PADDING} y1={PADDING + COURT_H - SERVICE_LINE} x2={PADDING + COURT_W} y2={PADDING + COURT_H - SERVICE_LINE} stroke="white" strokeWidth={1.5} opacity={0.8} />

            {/* Center service lines */}
            <Line x1={PADDING + COURT_W / 2} y1={PADDING + SERVICE_LINE} x2={PADDING + COURT_W / 2} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth={1} opacity={0.6} />
            <Line x1={PADDING + COURT_W / 2} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W / 2} y2={PADDING + COURT_H - SERVICE_LINE} stroke="white" strokeWidth={1} opacity={0.6} />

            {/* Glass walls — back walls */}
            <Line x1={PADDING} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING} stroke="#aaddff" strokeWidth={5} opacity={0.5} />
            <Line x1={PADDING} y1={PADDING + COURT_H} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth={5} opacity={0.5} />

            {/* Side glass (3m from back = 72 units) */}
            <Line x1={PADDING} y1={PADDING} x2={PADDING} y2={PADDING + 72} stroke="#aaddff" strokeWidth={3} opacity={0.4} />
            <Line x1={PADDING + COURT_W} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING + 72} stroke="#aaddff" strokeWidth={3} opacity={0.4} />
            <Line x1={PADDING} y1={PADDING + COURT_H - 72} x2={PADDING} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth={3} opacity={0.4} />
            <Line x1={PADDING + COURT_W} y1={PADDING + COURT_H - 72} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth={3} opacity={0.4} />

            {/* Side fence (wire mesh) */}
            <Line x1={PADDING} y1={PADDING + 72} x2={PADDING} y2={PADDING + COURT_H - 72} stroke="white" strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
            <Line x1={PADDING + COURT_W} y1={PADDING + 72} x2={PADDING + COURT_W} y2={PADDING + COURT_H - 72} stroke="white" strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />

            {/* Drawing preview line */}
            {lineStart && linePreview ? (
              <Line
                x1={lineStart.x}
                y1={lineStart.y}
                x2={linePreview.x}
                y2={linePreview.y}
                stroke={tool === "arrow" ? "white" : "#facc15"}
                strokeWidth={2}
                strokeDasharray={tool === "movement" ? "6 4" : undefined}
                markerEnd={tool === "arrow" ? "url(#arrowhead)" : "url(#arrowhead-dashed)"}
                opacity={0.7}
              />
            ) : null}

            {/* Elements */}
            {elements.map((el) => (
              <CourtElementShape key={el.id} element={el} isSelected={selectedId === el.id} />
            ))}
          </Svg>
        </View>
      </GestureDetector>

      <Text className="text-xs text-muted-foreground">{t("training.diagram.instructionsTouch")}</Text>
    </View>
  );
}

function playerCountFrom(elements: CourtElement[]) {
  return elements.filter((el) => isPlayerTool(el.type as Tool)).length;
}

function CourtElementShape({ element: el, isSelected }: { element: CourtElement; isSelected: boolean }) {
  const selectionStroke = isSelected ? "#38bdf8" : "transparent";
  const selectionWidth = isSelected ? 2 : 0;
  const isPlayer = el.type.startsWith("player_") || el.type === "coach";
  const color = PLAYER_COLORS[el.type];

  if (isPlayer) {
    return (
      <G testID={`diagram-element-${el.id}`}>
        <Circle cx={el.x} cy={el.y} r={14} fill={color} stroke={selectionStroke} strokeWidth={selectionWidth + 2} />
        <SvgText x={el.x} y={el.y + 1} textAnchor="middle" alignmentBaseline="central" fill="white" fontSize={10} fontWeight="bold">
          {el.label || el.type}
        </SvgText>
      </G>
    );
  }

  switch (el.type) {
    case "cone":
      return (
        <G testID={`diagram-element-${el.id}`}>
          <Polygon
            points={`${el.x},${el.y - 10} ${el.x - 8},${el.y + 6} ${el.x + 8},${el.y + 6}`}
            fill="#f97316"
            stroke={selectionStroke}
            strokeWidth={selectionWidth + 1}
          />
        </G>
      );
    case "blocker":
      return (
        <G testID={`diagram-element-${el.id}`}>
          <Rect x={el.x - 15} y={el.y - 5} width={30} height={10} rx={2} fill="#6b7280" stroke={selectionStroke} strokeWidth={selectionWidth + 1} />
        </G>
      );
    case "ball":
      return (
        <G testID={`diagram-element-${el.id}`}>
          <Circle cx={el.x} cy={el.y} r={6} fill="#facc15" stroke={isSelected ? selectionStroke : "#a16207"} strokeWidth={isSelected ? selectionWidth + 1 : 1.5} />
        </G>
      );
    case "arrow":
    case "movement": {
      const x1 = el.x;
      const y1 = el.y;
      const x2 = el.endX ?? el.x;
      const y2 = el.endY ?? el.y;
      const curve = el.curve ?? 0;
      const isArrow = el.type === "arrow";

      const d = bezierPath(x1, y1, x2, y2, curve);
      const mid = bezierMidpoint(x1, y1, x2, y2, curve);

      const strokeColor = isSelected ? "#38bdf8" : isArrow ? "white" : "#facc15";
      const markerEnd = isSelected ? "url(#arrowhead-sel)" : isArrow ? "url(#arrowhead)" : "url(#arrowhead-dashed)";

      return (
        <G testID={`diagram-element-${el.id}`}>
          {/* Wide invisible hitbox — visual affordance only; actual hit-testing is manual (see hitTestElement). */}
          <Path d={d} stroke="transparent" strokeWidth={14} fill="none" />
          <Path
            d={d}
            stroke={strokeColor}
            strokeWidth={isArrow ? 2.5 : 2}
            strokeDasharray={isArrow ? undefined : "6 4"}
            fill="none"
            markerEnd={markerEnd}
          />
          {el.label ? (
            <G>
              <Rect
                x={mid.x - el.label.length * 3.5 - 4}
                y={mid.y - 7}
                width={el.label.length * 7 + 8}
                height={14}
                rx={3}
                fill="#1a6b35"
              />
              <SvgText x={mid.x} y={mid.y + 1} textAnchor="middle" alignmentBaseline="central" fill="white" fontSize={9} fontWeight="600">
                {el.label}
              </SvgText>
            </G>
          ) : null}
          {isSelected ? (
            <G>
              <Rect x={x1 - 4} y={y1 - 4} width={8} height={8} rx={1} fill="white" stroke="#38bdf8" strokeWidth={1.5} />
              <Rect x={x2 - 4} y={y2 - 4} width={8} height={8} rx={1} fill="white" stroke="#38bdf8" strokeWidth={1.5} />
              <Circle cx={mid.x} cy={mid.y} r={5} fill="white" stroke="#38bdf8" strokeWidth={2} />
            </G>
          ) : null}
        </G>
      );
    }
    default:
      return null;
  }
}
