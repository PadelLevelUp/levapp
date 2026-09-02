import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CourtElement, CourtElementType, CourtDiagram } from "@/types/training";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import {
  MousePointer2,
  User,
  Triangle,
  RectangleHorizontal,
  Circle,
  ArrowRight,
  Route,
  Trash2,
  RotateCcw,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Padel court: 10m wide x 20m long → 240 x 480 SVG units (ratio 1:2)
const COURT_W = 240;
const COURT_H = 480;
const PADDING = 20;
const VB_W = COURT_W + PADDING * 2;
const VB_H = COURT_H + PADDING * 2;

// Service line distance from back wall: ~6.95m → ~167 units
const SERVICE_LINE = 167;

// Player colors
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

// These hues are DIAGRAM CONTENT, not UI status, and are deliberately left
// outside the semantic palette: telling player 2 from player 3 on a court plan
// needs four distinguishable colours, and the court is green because courts are
// green. Mapping them onto success/warning/destructive would make a tactical
// drawing look like it were reporting errors.
const TOOLS: { tool: Tool; icon: any; labelKey: string; colorClass?: string }[] = [
  { tool: "select", icon: MousePointer2, labelKey: "training.diagram.tools.select" },
  { tool: "player_1", icon: User, labelKey: "training.diagram.tools.player1", colorClass: "text-blue-500" },
  { tool: "player_2", icon: User, labelKey: "training.diagram.tools.player2", colorClass: "text-red-500" },
  { tool: "player_3", icon: User, labelKey: "training.diagram.tools.player3", colorClass: "text-green-500" },
  { tool: "player_4", icon: User, labelKey: "training.diagram.tools.player4", colorClass: "text-purple-500" },
  { tool: "coach", icon: GraduationCap, labelKey: "training.diagram.tools.coach", colorClass: "text-amber-500" },
  { tool: "cone", icon: Triangle, labelKey: "training.diagram.tools.cone" },
  { tool: "blocker", icon: RectangleHorizontal, labelKey: "training.diagram.tools.blocker" },
  { tool: "ball", icon: Circle, labelKey: "training.diagram.tools.ball" },
  { tool: "arrow", icon: ArrowRight, labelKey: "training.diagram.tools.arrow" },
  { tool: "movement", icon: Route, labelKey: "training.diagram.tools.movement" },
  { tool: "eraser", icon: Trash2, labelKey: "training.diagram.tools.eraser" },
];

/** Compute quadratic bezier control point from curve offset */
function getControlPoint(x1: number, y1: number, x2: number, y2: number, curve: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  return { cx: mx + px * curve, cy: my + py * curve };
}

/** Build SVG path for a quadratic bezier arrow */
function bezierPath(x1: number, y1: number, x2: number, y2: number, curve: number) {
  if (Math.abs(curve) < 2) {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const { cx, cy } = getControlPoint(x1, y1, x2, y2, curve);
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/** Get midpoint on the bezier for label placement */
function bezierMidpoint(x1: number, y1: number, x2: number, y2: number, curve: number) {
  if (Math.abs(curve) < 2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const { cx, cy } = getControlPoint(x1, y1, x2, y2, curve);
  // Quadratic bezier at t=0.5: B = (1-t)²P0 + 2(1-t)tP1 + t²P2
  return {
    x: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
    y: 0.25 * y1 + 0.5 * cy + 0.25 * y2,
  };
}

interface Props {
  value: CourtDiagram;
  onChange: (diagram: CourtDiagram) => void;
}

export function CourtDiagramEditor({ value, onChange }: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ x: number; y: number } | null>(null);
  const [curveDragging, setCurveDragging] = useState<string | null>(null);
  const [endpointDragging, setEndpointDragging] = useState<{ id: string; point: "start" | "end" } | null>(null);

  const elements = value.elements;
  const selectedEl = selectedId ? elements.find((e) => e.id === selectedId) : null;
  const isLineSelected = selectedEl?.type === "arrow" || selectedEl?.type === "movement";

  const setElements = useCallback(
    (els: CourtElement[]) => onChange({ elements: els }),
    [onChange]
  );

  const playerTypes = ["player_1", "player_2", "player_3", "player_4"] as const;

  function isPlayerTool(t: Tool): t is "player_1" | "player_2" | "player_3" | "player_4" {
    return playerTypes.includes(t as any);
  }

  function playerCount() {
    return elements.filter((e) => playerTypes.includes(e.type as any)).length;
  }

  function toSvgCoords(e: React.PointerEvent | React.MouseEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  function updateSelectedElement(updates: Partial<CourtElement>) {
    if (!selectedId) return;
    setElements(elements.map((el) => (el.id === selectedId ? { ...el, ...updates } : el)));
  }

  function handleCanvasPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.target !== svgRef.current && tool === "select") return;

    const pt = toSvgCoords(e);

    if (tool === "arrow" || tool === "movement") {
      setLineStart(pt);
      setLinePreview(pt);
      return;
    }

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    if (tool === "eraser") return;

    if (isPlayerTool(tool) && playerCount() >= MAX_PLAYERS) return;
    if (isPlayerTool(tool) && elements.some((el) => el.type === tool)) return;

    const newEl: CourtElement = {
      id: crypto.randomUUID(),
      type: tool as CourtElementType,
      x: pt.x,
      y: pt.y,
      label: PLAYER_LABELS[tool] || undefined,
    };
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
    setTool("select");
  }

  function handleCanvasPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pt = toSvgCoords(e);

    if (endpointDragging) {
      const updates = endpointDragging.point === "start"
        ? { x: pt.x, y: pt.y }
        : { endX: pt.x, endY: pt.y };
      setElements(elements.map((el) => el.id === endpointDragging.id ? { ...el, ...updates } : el));
      return;
    }

    if (curveDragging) {
      const el = elements.find((el) => el.id === curveDragging);
      if (el && el.endX != null && el.endY != null) {
        const mx = (el.x + el.endX) / 2;
        const my = (el.y + el.endY) / 2;
        const dx = el.endX - el.x;
        const dy = el.endY - el.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const curve = ((pt.x - mx) * px + (pt.y - my) * py);
        setElements(elements.map((el2) => el2.id === curveDragging ? { ...el2, curve: Math.round(curve / 5) * 5 } : el2));
      }
      return;
    }

    if (lineStart) {
      setLinePreview(pt);
      return;
    }

    if (dragging) {
      setElements(
        elements.map((el) =>
          el.id === dragging
            ? { ...el, x: pt.x - dragOffset.x, y: pt.y - dragOffset.y }
            : el
        )
      );
    }
  }

  function handleCanvasPointerUp() {
    if (endpointDragging) {
      setEndpointDragging(null);
      return;
    }

    if (curveDragging) {
      setCurveDragging(null);
      return;
    }

    if (lineStart && linePreview) {
      const dx = linePreview.x - lineStart.x;
      const dy = linePreview.y - lineStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        const newEl: CourtElement = {
          id: crypto.randomUUID(),
          type: tool as CourtElementType,
          x: lineStart.x,
          y: lineStart.y,
          endX: linePreview.x,
          endY: linePreview.y,
          curve: 0,
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
      }
      setLineStart(null);
      setLinePreview(null);
      return;
    }

    setDragging(null);
  }

  function handleElementPointerDown(e: React.PointerEvent, elId: string) {
    e.stopPropagation();

    if (tool === "eraser") {
      setElements(elements.filter((el) => el.id !== elId));
      return;
    }

    if (tool === "select") {
      const el = elements.find((el) => el.id === elId)!;
      if (el.type === "arrow" || el.type === "movement") {
        setSelectedId(elId);
      } else {
        const pt = toSvgCoords(e);
        setDragOffset({ x: pt.x - el.x, y: pt.y - el.y });
        setDragging(elId);
        setSelectedId(elId);
      }
    }
  }

  function handleClear() {
    setElements([]);
    setSelectedId(null);
  }

  function handleDeleteSelected() {
    if (selectedId) {
      setElements(elements.filter((el) => el.id !== selectedId));
      setSelectedId(null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          handleDeleteSelected();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, elements]);

  function isToolDisabled(t: Tool) {
    if (isPlayerTool(t) && elements.some((el) => el.type === t)) return true;
    if (t === "coach" && elements.some((el) => el.type === "coach")) return true;
    return false;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{t("training.diagram.label")}</label>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        {TOOLS.map(({ tool: toolItem, icon: Icon, labelKey, colorClass }) => {
          const disabled = isToolDisabled(toolItem);
          const label = t(labelKey);
          return (
            <Button
              key={toolItem}
              type="button"
              variant={tool === toolItem ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-8 px-2 text-xs gap-1",
                colorClass && tool !== toolItem && colorClass,
                disabled && "opacity-40 pointer-events-none"
              )}
              onClick={() => setTool(toolItem)}
              title={label}
              disabled={disabled}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          );
        })}
        <div className="flex-1" />
        {selectedId && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-destructive" onClick={handleDeleteSelected} title={t("training.diagram.deleteSelected")}>
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("training.diagram.delete")}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={handleClear} title={t("training.diagram.clearAll")}>
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("training.diagram.clear")}</span>
        </Button>
      </div>

      {/* Line label editor */}
      {isLineSelected && selectedEl && (
        <div className="flex gap-3 p-3 bg-muted/60 rounded-lg border">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">{t("training.diagram.lineLabel")}</Label>
            <Input
              value={selectedEl.label || ""}
              onChange={(e) => updateSelectedElement({ label: e.target.value || undefined })}
              placeholder={t("training.diagram.lineLabelPlaceholder")}
              className="h-8 text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground self-end pb-1">{t("training.diagram.curveHint")}</p>
        </div>
      )}

      {/* Court SVG */}
      <div className="border rounded-lg bg-emerald-900/90 overflow-hidden" style={{ touchAction: "none" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          style={{ maxHeight: "520px" }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="white" />
            </marker>
            <marker id="arrowhead-dashed" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#facc15" />
            </marker>
            <marker id="arrowhead-sel" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--ring))" />
            </marker>
          </defs>

          {/* Court background */}
          <rect x={PADDING} y={PADDING} width={COURT_W} height={COURT_H} fill="#1a6b35" stroke="white" strokeWidth="2" rx="2" />

          {/* Net */}
          <line x1={PADDING} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth="3" />

          {/* Service lines */}
          <line x1={PADDING} y1={PADDING + SERVICE_LINE} x2={PADDING + COURT_W} y2={PADDING + SERVICE_LINE} stroke="white" strokeWidth="1.5" opacity="0.8" />
          <line x1={PADDING} y1={PADDING + COURT_H - SERVICE_LINE} x2={PADDING + COURT_W} y2={PADDING + COURT_H - SERVICE_LINE} stroke="white" strokeWidth="1.5" opacity="0.8" />

          {/* Center service lines */}
          <line x1={PADDING + COURT_W / 2} y1={PADDING + SERVICE_LINE} x2={PADDING + COURT_W / 2} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth="1" opacity="0.6" />
          <line x1={PADDING + COURT_W / 2} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W / 2} y2={PADDING + COURT_H - SERVICE_LINE} stroke="white" strokeWidth="1" opacity="0.6" />

          {/* Glass walls — back walls */}
          <line x1={PADDING} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING} stroke="#aaddff" strokeWidth="5" opacity="0.5" />
          <line x1={PADDING} y1={PADDING + COURT_H} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="5" opacity="0.5" />

          {/* Side glass (3m from back = 72 units) */}
          <line x1={PADDING} y1={PADDING} x2={PADDING} y2={PADDING + 72} stroke="#aaddff" strokeWidth="3" opacity="0.4" />
          <line x1={PADDING + COURT_W} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING + 72} stroke="#aaddff" strokeWidth="3" opacity="0.4" />
          <line x1={PADDING} y1={PADDING + COURT_H - 72} x2={PADDING} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="3" opacity="0.4" />
          <line x1={PADDING + COURT_W} y1={PADDING + COURT_H - 72} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="3" opacity="0.4" />

          {/* Side fence (wire mesh) */}
          <line x1={PADDING} y1={PADDING + 72} x2={PADDING} y2={PADDING + COURT_H - 72} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
          <line x1={PADDING + COURT_W} y1={PADDING + 72} x2={PADDING + COURT_W} y2={PADDING + COURT_H - 72} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />

          {/* Drawing preview line */}
          {lineStart && linePreview && (
            <line
              x1={lineStart.x}
              y1={lineStart.y}
              x2={linePreview.x}
              y2={linePreview.y}
              stroke={tool === "arrow" ? "white" : "#facc15"}
              strokeWidth="2"
              strokeDasharray={tool === "movement" ? "6 4" : "none"}
              markerEnd={tool === "arrow" ? "url(#arrowhead)" : "url(#arrowhead-dashed)"}
              opacity="0.7"
            />
          )}

          {/* Render elements */}
          {elements.map((el) => (
            <CourtElementRenderer
              key={el.id}
              element={el}
              isSelected={selectedId === el.id}
              onPointerDown={(e) => handleElementPointerDown(e, el.id)}
              onCurveDragStart={() => { setSelectedId(el.id); setCurveDragging(el.id); }}
              onEndpointDragStart={(point) => { setSelectedId(el.id); setEndpointDragging({ id: el.id, point }); }}
              cursor={tool === "eraser" ? "crosshair" : tool === "select" ? "grab" : "default"}
            />
          ))}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("training.diagram.instructions")}
      </p>
    </div>
  );
}

function CourtElementRenderer({
  element: el,
  isSelected,
  onPointerDown,
  onCurveDragStart,
  onEndpointDragStart,
  cursor,
}: {
  element: CourtElement;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onCurveDragStart?: () => void;
  onEndpointDragStart?: (point: "start" | "end") => void;
  cursor: string;
}) {
  const selectionStroke = isSelected ? "hsl(var(--ring))" : "transparent";
  const selectionWidth = isSelected ? 2 : 0;

  const isPlayer = el.type.startsWith("player_") || el.type === "coach";
  const color = PLAYER_COLORS[el.type];

  if (isPlayer) {
    return (
      <g onPointerDown={onPointerDown} style={{ cursor }}>
        <circle cx={el.x} cy={el.y} r="14" fill={color} stroke={selectionStroke} strokeWidth={selectionWidth + 2} />
        <text x={el.x} y={el.y + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="bold">
          {el.label || el.type}
        </text>
      </g>
    );
  }

  switch (el.type) {
    case "cone":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          <polygon
            points={`${el.x},${el.y - 10} ${el.x - 8},${el.y + 6} ${el.x + 8},${el.y + 6}`}
            fill="#f97316"
            stroke={selectionStroke}
            strokeWidth={selectionWidth + 1}
          />
        </g>
      );
    case "blocker":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          <rect x={el.x - 15} y={el.y - 5} width="30" height="10" rx="2" fill="#6b7280" stroke={selectionStroke} strokeWidth={selectionWidth + 1} />
        </g>
      );
    case "ball":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          <circle cx={el.x} cy={el.y} r="6" fill="#facc15" stroke={isSelected ? selectionStroke : "#a16207"} strokeWidth={isSelected ? selectionWidth + 1 : 1.5} />
        </g>
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

      const strokeColor = isSelected
        ? "hsl(var(--ring))"
        : isArrow
        ? "white"
        : "#facc15";
      const markerEnd = isSelected
        ? "url(#arrowhead-sel)"
        : isArrow
        ? "url(#arrowhead)"
        : "url(#arrowhead-dashed)";

      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          {/* Wide invisible hitbox */}
          <path d={d} stroke="transparent" strokeWidth="14" fill="none" />
          {/* Visible path */}
          <path
            d={d}
            stroke={strokeColor}
            strokeWidth={isArrow ? 2.5 : 2}
            strokeDasharray={isArrow ? "none" : "6 4"}
            fill="none"
            markerEnd={markerEnd}
          />
          {/* Label at midpoint */}
          {el.label && (
            <>
              <rect
                x={mid.x - el.label.length * 3.5 - 4}
                y={mid.y - 7}
                width={el.label.length * 7 + 8}
                height={14}
                rx="3"
                fill="#1a6b35"
              />
              <text
                x={mid.x}
                y={mid.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="9"
                fontWeight="600"
              >
                {el.label}
              </text>
            </>
          )}
          {/* Draggable handles when selected */}
          {isSelected && (
            <>
              {/* Start endpoint */}
              <rect
                x={x1 - 4} y={y1 - 4} width={8} height={8} rx="1"
                fill="white" stroke="hsl(var(--ring))" strokeWidth="1.5"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => { e.stopPropagation(); onEndpointDragStart?.("start"); }}
              />
              {/* End endpoint */}
              <rect
                x={x2 - 4} y={y2 - 4} width={8} height={8} rx="1"
                fill="white" stroke="hsl(var(--ring))" strokeWidth="1.5"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => { e.stopPropagation(); onEndpointDragStart?.("end"); }}
              />
              {/* Curve handle at midpoint */}
              <circle
                cx={mid.x} cy={mid.y} r="5"
                fill="white" stroke="hsl(var(--ring))" strokeWidth="2"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => { e.stopPropagation(); onCurveDragStart?.(); }}
              />
            </>
          )}
        </g>
      );
    }
    default:
      return null;
  }
}
