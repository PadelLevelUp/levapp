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
} from "lucide-react";
import { cn } from "@/lib/utils";

// Court dimensions (padel court: 10m x 20m, using 200x400 SVG units)
const COURT_W = 200;
const COURT_H = 400;
const PADDING = 20;
const VB_W = COURT_W + PADDING * 2;
const VB_H = COURT_H + PADDING * 2;

type Tool =
  | "select"
  | "player_a"
  | "player_b"
  | "cone"
  | "blocker"
  | "ball"
  | "arrow"
  | "movement"
  | "eraser";

const TOOLS: { tool: Tool; icon: any; label: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Seleccionar" },
  { tool: "player_a", icon: User, label: "Jugador A" },
  { tool: "player_b", icon: User, label: "Jugador B" },
  { tool: "cone", icon: Triangle, label: "Cono" },
  { tool: "blocker", icon: RectangleHorizontal, label: "Bloqueador" },
  { tool: "ball", icon: Circle, label: "Pelota" },
  { tool: "arrow", icon: ArrowRight, label: "Flecha" },
  { tool: "movement", icon: Route, label: "Movimiento" },
  { tool: "eraser", icon: Trash2, label: "Borrar" },
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

  // Counter for player labels
  const nextPlayerLabel = useCallback(
    (team: "player_a" | "player_b") => {
      const existing = elements.filter((e) => e.type === team);
      return String(existing.length + 1);
    },
    [elements]
  );

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

  // Place element on canvas click
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

    // Place element
    const newEl: CourtElement = {
      id: crypto.randomUUID(),
      type: tool as CourtElementType,
      x: pt.x,
      y: pt.y,
    };
    if (tool === "player_a" || tool === "player_b") {
      newEl.label = nextPlayerLabel(tool);
    }
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

  function handleCanvasPointerUp(e: React.PointerEvent<SVGSVGElement>) {
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
      const pt = toSvgCoords(e);
      const el = elements.find((el) => el.id === elId)!;
      setDragOffset({ x: pt.x - el.x, y: pt.y - el.y });
      setDragging(elId);
      setSelectedId(elId);
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

  // Keyboard shortcuts
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

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Diagrama de pista</label>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg">
        {TOOLS.map(({ tool: t, icon: Icon, label }) => (
          <Button
            key={t}
            type="button"
            variant={tool === t ? "default" : "ghost"}
            size="sm"
            className={cn("h-8 px-2 text-xs gap-1", t === "player_a" && "text-blue-600", t === "player_b" && "text-red-600")}
            onClick={() => setTool(t)}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={handleClear} title="Limpiar todo">
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Limpiar</span>
        </Button>
      </div>

      {/* Court SVG */}
      <div className="border rounded-lg bg-emerald-900/90 overflow-hidden" style={{ touchAction: "none" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          style={{ maxHeight: "500px" }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        >
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
            </marker>
            <marker id="arrowhead-dashed" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--chart-4))" />
            </marker>
          </defs>

          {/* Court background */}
          <rect x={PADDING} y={PADDING} width={COURT_W} height={COURT_H} fill="#2d6a3f" stroke="white" strokeWidth="2" rx="2" />

          {/* Net */}
          <line x1={PADDING} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth="3" />

          {/* Service lines */}
          <line x1={PADDING} y1={PADDING + 140} x2={PADDING + COURT_W} y2={PADDING + 140} stroke="white" strokeWidth="1.5" opacity="0.8" />
          <line x1={PADDING} y1={PADDING + 260} x2={PADDING + COURT_W} y2={PADDING + 260} stroke="white" strokeWidth="1.5" opacity="0.8" />

          {/* Center service lines */}
          <line x1={PADDING + COURT_W / 2} y1={PADDING + 140} x2={PADDING + COURT_W / 2} y2={PADDING + COURT_H / 2} stroke="white" strokeWidth="1" opacity="0.6" />
          <line x1={PADDING + COURT_W / 2} y1={PADDING + COURT_H / 2} x2={PADDING + COURT_W / 2} y2={PADDING + 260} stroke="white" strokeWidth="1" opacity="0.6" />

          {/* Glass walls - thicker lines at top/bottom */}
          <line x1={PADDING} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING} stroke="#aaddff" strokeWidth="4" opacity="0.6" />
          <line x1={PADDING} y1={PADDING + COURT_H} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="4" opacity="0.6" />

          {/* Side glass (partial - 3m = 60 units from back) */}
          <line x1={PADDING} y1={PADDING} x2={PADDING} y2={PADDING + 60} stroke="#aaddff" strokeWidth="3" opacity="0.5" />
          <line x1={PADDING + COURT_W} y1={PADDING} x2={PADDING + COURT_W} y2={PADDING + 60} stroke="#aaddff" strokeWidth="3" opacity="0.5" />
          <line x1={PADDING} y1={PADDING + COURT_H - 60} x2={PADDING} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="3" opacity="0.5" />
          <line x1={PADDING + COURT_W} y1={PADDING + COURT_H - 60} x2={PADDING + COURT_W} y2={PADDING + COURT_H} stroke="#aaddff" strokeWidth="3" opacity="0.5" />

          {/* Side fence (wire) */}
          <line x1={PADDING} y1={PADDING + 60} x2={PADDING} y2={PADDING + COURT_H - 60} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
          <line x1={PADDING + COURT_W} y1={PADDING + 60} x2={PADDING + COURT_W} y2={PADDING + COURT_H - 60} stroke="white" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />

          {/* Drawing preview line */}
          {lineStart && linePreview && (
            <line
              x1={lineStart.x}
              y1={lineStart.y}
              x2={linePreview.x}
              y2={linePreview.y}
              stroke={tool === "arrow" ? "hsl(var(--primary))" : "hsl(var(--chart-4))"}
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
        Selecciona una herramienta y haz clic en la pista para colocar elementos. Arrastra para mover. Supr para borrar.
      </p>
    </div>
  );
}

// Render individual court elements
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

  switch (el.type) {
    case "player_a":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          <circle cx={el.x} cy={el.y} r="14" fill="#3b82f6" stroke={selectionStroke} strokeWidth={selectionWidth + 2} />
          <text x={el.x} y={el.y + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="bold">
            {el.label || "A"}
          </text>
        </g>
      );
    case "player_b":
      return (
        <g onPointerDown={onPointerDown} style={{ cursor }}>
          <circle cx={el.x} cy={el.y} r="14" fill="#ef4444" stroke={selectionStroke} strokeWidth={selectionWidth + 2} />
          <text x={el.x} y={el.y + 1} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="11" fontWeight="bold">
            {el.label || "B"}
          </text>
        </g>
      );
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
        <line
          x1={el.x}
          y1={el.y}
          x2={el.endX ?? el.x}
          y2={el.endY ?? el.y}
          stroke={isSelected ? "hsl(var(--ring))" : "hsl(var(--primary))"}
          strokeWidth="2.5"
          markerEnd="url(#arrowhead)"
          onPointerDown={onPointerDown}
          style={{ cursor }}
        />
      );
    case "movement":
      return (
        <line
          x1={el.x}
          y1={el.y}
          x2={el.endX ?? el.x}
          y2={el.endY ?? el.y}
          stroke={isSelected ? "hsl(var(--ring))" : "hsl(var(--chart-4))"}
          strokeWidth="2"
          strokeDasharray="6 4"
          markerEnd="url(#arrowhead-dashed)"
          onPointerDown={onPointerDown}
          style={{ cursor }}
        />
      );
    default:
      return null;
  }
}
