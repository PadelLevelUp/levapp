import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Circle, MousePointer2, Route, Triangle, Undo2 } from "lucide-react";
import type { AnyCourtDiagram, BoardMode, CourtDiagramV2, Piece, Point, Step } from "@/types/training";
import {
  MIN_PATH_LENGTH,
  clampPercent,
  clientToPercent,
  newStep,
  upgradeCourtDiagram,
} from "@levelup/config";
import { cn } from "@/lib/utils";
import { CourtSurface, type PendingPath } from "./CourtSurface";
import { useBoardHistory } from "./useBoardHistory";

/**
 * Quadro Tático — the exercise diagram editor (training.tactical-board).
 *
 * Wave 1 ships the board shell and the Situações de jogo mode: a fixed 2v2,
 * one ball path per step (plana/lob), dashed player movements, cones, undo.
 * Basket and magnetic modes (waves 2–3) and the step/playback controls
 * (wave 4) plug into the same shell; tabs for modes that are not shipped are
 * not rendered rather than disabled (rule 2).
 *
 * Controlled: `value` may be a legacy v1 diagram, a v2 diagram or undefined —
 * it is upgraded on read (rule 12) and every mutation calls `onChange` with a
 * v2 diagram. The board keeps only interaction state (tool, selection, the
 * path being drawn, a drag in flight); the diagram itself is the caller's.
 */

type Tool = "select" | "ball" | "movement" | "cone";

const GAME_TOOLS: { tool: Tool; icon: typeof MousePointer2 }[] = [
  { tool: "select", icon: MousePointer2 },
  { tool: "ball", icon: Circle },
  { tool: "movement", icon: Route },
  { tool: "cone", icon: Triangle },
];

/** Modes rendered as tabs. Waves 2 and 3 append "basket" and "magnetic". */
const SHIPPED_MODES: BoardMode[] = ["game"];

interface Props {
  value: AnyCourtDiagram | undefined;
  onChange: (diagram: CourtDiagramV2) => void;
  className?: string;
}

/** Ids like `cone-1`, `cone-2` — stable and readable for tests on both platforms. */
function nextIndexedId(pieces: readonly Piece[], prefix: string): string {
  let max = 0;
  for (const p of pieces) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

function firstStep(d: CourtDiagramV2): Step {
  return d.steps[0] ?? newStep();
}

function withFirstStep(d: CourtDiagramV2, patch: (s: Step) => Step): CourtDiagramV2 {
  const step = patch(firstStep(d));
  return { ...d, steps: d.steps.length === 0 ? [step] : [step, ...d.steps.slice(1)] };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function TacticalBoard({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const diagram = useMemo(() => upgradeCourtDiagram(value), [value]);
  const { commit, undo, canUndo } = useBoardHistory<CourtDiagramV2>(diagram, onChange);

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPath | null>(null);
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: Point; position: Point; moved: boolean } | null>(null);

  const pointOf = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return clampPercent(clientToPercent(e.clientX, e.clientY, svg.getBoundingClientRect()));
  }, []);

  const selectTool = (next: Tool) => {
    setTool(next);
    setPending(null);
    setPendingPlayerId(null);
    setSelectedId(null);
  };

  const movePiece = (id: string, to: Point) =>
    commit({ ...diagram, pieces: diagram.pieces.map((p) => (p.id === id && p.kind !== "stroke" ? { ...p, x: to.x, y: to.y } : p)) });

  const finishBallPath = (from: Point, to: Point) => {
    if (distance(from, to) < MIN_PATH_LENGTH) return false;
    commit(withFirstStep(diagram, (s) => ({ ...s, ball: { from, to, style: "flat" } })));
    setPending(null);
    return true;
  };

  const toggleBallStyle = () => {
    const step = diagram.steps[0];
    if (!step?.ball) return;
    const style = step.ball.style === "lob" ? "flat" : "lob";
    commit(withFirstStep(diagram, (s) => ({ ...s, ball: s.ball ? { ...s.ball, style } : s.ball })));
  };

  const addMovement = (pieceId: string, to: Point) => {
    commit(
      withFirstStep(diagram, (s) => ({
        ...s,
        movements: [...s.movements.filter((m) => m.pieceId !== pieceId), { pieceId, to }],
      }))
    );
    setPendingPlayerId(null);
    setPending(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const piece = diagram.pieces.find((p) => p.id === selectedId);
    if (!piece || piece.kind === "player" || piece.kind === "feeder") return; // fixed pieces in game mode (rule 7)
    commit({
      ...diagram,
      pieces: diagram.pieces.filter((p) => p.id !== selectedId),
      steps: diagram.steps.map((s) => ({ ...s, movements: s.movements.filter((m) => m.pieceId !== selectedId) })),
    });
    setSelectedId(null);
  };

  // ── court (background) ────────────────────────────────────────────────────
  const onCourtPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const pt = pointOf(e);
    switch (tool) {
      case "select": {
        if (selectedId) {
          movePiece(selectedId, pt); // tap-to-move (rule 8)
        }
        return;
      }
      case "ball": {
        if (pending && pending.kind === "ball") {
          if (finishBallPath(pending.from, pt)) return;
        }
        setPending({ kind: "ball", from: pt });
        return;
      }
      case "movement": {
        if (pendingPlayerId) addMovement(pendingPlayerId, pt);
        return;
      }
      case "cone": {
        const id = nextIndexedId(diagram.pieces, "cone");
        commit({ ...diagram, pieces: [...diagram.pieces, { id, kind: "cone", x: pt.x, y: pt.y }] });
        setSelectedId(id);
        return;
      }
    }
  };

  const onCourtPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag) {
      const pt = pointOf(e);
      const position = clampPercent({ x: pt.x - drag.offset.x, y: pt.y - drag.offset.y });
      const moved = drag.moved || distance(position, drag.position) > 0.5;
      setDrag({ ...drag, position, moved });
      return;
    }
    if (pending) {
      const pt = pointOf(e);
      if (distance(pt, pending.from) > 0.5) setPending({ ...pending, to: pt });
    }
  };

  const onCourtPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag) {
      if (drag.moved) movePiece(drag.id, drag.position);
      setDrag(null);
      return;
    }
    if (pending?.kind === "ball" && pending.to) {
      // drag-to-draw: the path ends where the pointer was released
      finishBallPath(pending.from, pointOf(e));
    }
  };

  // ── pieces ────────────────────────────────────────────────────────────────
  const onPiecePointerDown = (piece: Piece, e: React.PointerEvent<SVGGElement>) => {
    if (piece.kind === "stroke") return;
    if (tool === "select") {
      e.stopPropagation();
      const pt = pointOf(e);
      setSelectedId(piece.id);
      setDrag({ id: piece.id, offset: { x: pt.x - piece.x, y: pt.y - piece.y }, position: { x: piece.x, y: piece.y }, moved: false });
      try {
        svgRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom */
      }
      return;
    }
    if (tool === "movement" && piece.kind === "player") {
      e.stopPropagation();
      setPendingPlayerId(piece.id);
      setPending({ kind: "movement", from: { x: piece.x, y: piece.y } });
      return;
    }
    // ball / cone: a tap on a piece counts as a tap on the court underneath it
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (svgRef.current && !svgRef.current.closest("[data-tactical-board]")?.contains(document.activeElement)) return;
      deleteSelected();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hint = t(`training.board.hints.${tool}`);

  return (
    <div
      data-tactical-board
      data-testid="tactical-board"
      className={cn("rounded-[20px] bg-sidebar text-sidebar-foreground shadow-lg overflow-hidden", className)}
    >
      {/* header */}
      <div className="flex items-baseline gap-2 px-6 py-4 border-b border-white/10">
        <span className="font-bold text-base tracking-wide text-white">{t("training.board.brand")}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">· {t("training.board.title")}</span>
      </div>

      {/* mode tabs */}
      <div role="tablist" aria-label={t("training.board.title")} className="flex border-b border-white/10">
        {SHIPPED_MODES.map((mode) => {
          const active = diagram.mode === mode || (mode === "game" && !SHIPPED_MODES.includes(diagram.mode));
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`board-tab-${mode}`}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 px-3 py-3.5 border-b-2 transition-colors",
                active ? "border-primary bg-primary/15 text-white" : "border-transparent text-sidebar-foreground/70 hover:text-white"
              )}
            >
              <span className="text-sm font-bold">{t(`training.board.modes.${mode}.title`)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{t(`training.board.modes.${mode}.subtitle`)}</span>
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-3.5 pb-2">
        <div role="radiogroup" aria-label={t("training.board.title")} className="flex flex-wrap gap-2">
          {GAME_TOOLS.map(({ tool: tl, icon: Icon }) => {
            const active = tool === tl;
            return (
              <button
                key={tl}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(`training.board.tools.${tl}`)}
                data-testid={`board-tool-${tl}`}
                onClick={() => selectTool(tl)}
                className={cn(
                  "flex min-w-[58px] flex-col items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] transition-colors",
                  active ? "border-primary bg-primary/20 text-white" : "border-white/15 text-sidebar-foreground/70 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{t(`training.board.tools.${tl}`)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={t("training.board.undo")}
          title={t("training.board.undo")}
          disabled={!canUndo}
          onClick={undo}
          className="rounded-full p-2 text-sidebar-foreground/70 hover:text-white disabled:opacity-40 disabled:hover:text-sidebar-foreground/70"
        >
          <Undo2 className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
      <p data-testid={`board-hint-${tool}`} className="px-6 pb-3 text-xs text-sidebar-foreground/70">
        {hint}
      </p>

      {/* court */}
      <div className="flex justify-center px-6 pb-5 pt-1">
        <div className="relative w-full max-w-[340px] rounded-[10px] bg-[#0D1B31] px-4 pt-[22px] pb-[22px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <span className="pointer-events-none absolute left-0 right-0 top-1 text-center text-[9px] font-semibold tracking-[0.16em] text-white/30">{t("training.board.teams.a")}</span>
          <span className="pointer-events-none absolute left-0 right-0 bottom-1 text-center text-[9px] font-semibold tracking-[0.16em] text-white/30">{t("training.board.teams.b")}</span>
          <CourtSurface
            ref={svgRef}
            diagram={diagram}
            selectedId={selectedId}
            dragOverride={drag ? { id: drag.id, position: drag.position } : null}
            pending={pending}
            ariaLabel={t("training.board.canvasAria")}
            ballHandleLabel={t("training.board.ballStyleToggle")}
            className={cn(tool === "select" ? "cursor-default" : "cursor-crosshair")}
            onPointerDown={onCourtPointerDown}
            onPointerMove={onCourtPointerMove}
            onPointerUp={onCourtPointerUp}
            onPiecePointerDown={onPiecePointerDown}
            onBallHandleClick={toggleBallStyle}
          />
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-5 border-t border-white/10 px-6 pb-4 pt-2.5 text-[11px] font-semibold text-sidebar-foreground/70">
        <span className="flex items-center gap-1.5"><ArrowRight className="h-4 w-4" aria-hidden />{t("training.board.legend.ball")}</span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M4 12h16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" /></svg>
          {t("training.board.legend.movement")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#4A9BFF" }} />{t("training.board.legend.teamA")}
          <span className="ml-2 inline-block h-3 w-3 rounded-full" style={{ background: "#D3453B" }} />{t("training.board.legend.teamB")}
        </span>
      </div>
    </div>
  );
}
