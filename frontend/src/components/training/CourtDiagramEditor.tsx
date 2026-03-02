import { useState, useRef, useCallback, useEffect } from "react";
import type { CourtElement, CourtElementType, CourtDiagram } from "@/types/training";
import { Button } from "@/components/ui/button";
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
  player_1: "#3b82f6", // blue
  player_2: "#ef4444", // red
  player_3: "#22c55e", // green
  player_4: "#a855f7", // purple
  coach: "#f59e0b",    // amber
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

const TOOLS: { tool: Tool; icon: any; label: string; colorClass?: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select" },
  { tool: "player_1", icon: User, label: "Player 1", colorClass: "text-blue-500" },
  { tool: "player_2", icon: User, label: "Player 2", colorClass: "text-red-500" },
  { tool: "player_3", icon: User, label: "Player 3", colorClass: "text-green-500" },
  { tool: "player_4", icon: User, label: "Player 4", colorClass: "text-purple-500" },
  { tool: "coach", icon: GraduationCap, label: "Coach", colorClass: "text-amber-500" },
  { tool: "cone", icon: Triangle, label: "Cone" },
  { tool: "blocker", icon: RectangleHorizontal, label: "Blocker" },
  { tool: "ball", icon: Circle, label: "Ball" },
  { tool: "arrow", icon: ArrowRight, label: "Arrow" },
  { tool: "movement", icon: Route, label: "Movement" },
  { tool: "eraser", icon: Trash2, label: "Eraser" },
];

interface Props {
  value: CourtDiagram;
  onChange: (diagram: CourtDiagram) => void;
}

export function CourtDiagramEditor({ value, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [linePreview, setLinePreview] = useState<{ x: number; y: number } | null>(null);

  const elements = value.elements;

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

    // Enforce max 4 players
    if (isPlayerTool(tool) && playerCount() >= MAX_PLAYERS) {
      return;
    }

    // Prevent duplicate of same player type
    if (isPlayerTool(tool) && elements.some((el) => el.type === tool)) {
      return;
    }

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
        // For lines, just select (no drag)
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

  // Disable player tools if already placed
  function isToolDisabled(t: Tool) {
    if (isPlayerTool(t) && elements.some((el) => el.type === t)) return true;
    if (t === "coach" && elements.some((el) => el.type === "coach")) return true;
    return false;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Court Diagram</label>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        {TOOLS.map(({ tool: t, icon: Icon, label, colorClass }) => {
          const disabled = isToolDisabled(t);
          return (
            <Button
              key={t}
              type="button"
              variant={tool === t ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-8 px-2 text-xs gap-1",
                colorClass && tool !== t && colorClass,
                disabled && "opacity-40 pointer-events-none"
              )}
              onClick={() => setTool(t)}
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
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-destructive" onClick={handleDeleteSelected} title="Delete selected">
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={handleClear} title="Clear all">
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </Button>
      </div>

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
              cursor={tool === "eraser" ? "crosshair" : tool === "select" ? "grab" : "default"}
            />
          ))}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        Select a tool and click on the court to place elements. Drag to move. Press Delete to remove. Max 4 players.
      </p>
    </div>
  );
}

function CourtElementRenderer({
  element: el,
  isSelected,
  onPointerDown,
  cursor,
}: {
  element: CourtElement;
  isSelected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
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
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          {/* Invisible wider hitbox for easier selection */}
          <line
            x1={el.x} y1={el.y} x2={el.endX ?? el.x} y2={el.endY ?? el.y}
            stroke="transparent" strokeWidth="14"
          />
          <line
            x1={el.x} y1={el.y} x2={el.endX ?? el.x} y2={el.endY ?? el.y}
            stroke={isSelected ? "hsl(var(--ring))" : "white"}
            strokeWidth="2.5"
            markerEnd={isSelected ? "url(#arrowhead-sel)" : "url(#arrowhead)"}
          />
        </g>
      );
    case "movement":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          {/* Invisible wider hitbox */}
          <line
            x1={el.x} y1={el.y} x2={el.endX ?? el.x} y2={el.endY ?? el.y}
            stroke="transparent" strokeWidth="14"
          />
          <line
            x1={el.x} y1={el.y} x2={el.endX ?? el.x} y2={el.endY ?? el.y}
            stroke={isSelected ? "hsl(var(--ring))" : "#facc15"}
            strokeWidth="2"
            strokeDasharray="6 4"
            markerEnd={isSelected ? "url(#arrowhead-sel)" : "url(#arrowhead-dashed)"}
          />
        </g>
      );
    default:
      return null;
  }
}
