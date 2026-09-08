import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft, ChevronRight, Circle, MousePointer2, Pencil, Plus, Route, ShoppingBasket, Trash2, Triangle, Undo2, User, UserPlus } from "lucide-react";
import type { AnyCourtDiagram, BoardMode, CourtDiagramV2, Piece, PieceColor, Point } from "@/types/training";
import {
  INITIAL_BOARD_STATE,
  MAX_BASKET_PLAYERS,
  STEP_DURATION_MS,
  SWATCHES,
  addPlayer,
  boardAddStep,
  boardDeleteStep,
  boardDeleteSelected,
  boardDragEnd,
  boardHasContent,
  boardPress,
  boardSelectTool,
  boardSetColor,
  boardSetStep,
  boardStrokeEnd,
  boardSwitchMode,
  boardToggleBallStyle,
  clampPercent,
  clientToPercent,
  defaultToolForMode,
  interpolateStep,
  piecesAtStep,
  playerCount,
  stepCount,
  swatchHex as swatch,
  toolsForMode,
  upgradeCourtDiagram,
  type BoardState,
  type BoardTool,
} from "@levelup/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CourtSurface } from "./CourtSurface";
import { useBoardHistory } from "./useBoardHistory";

/**
 * Quadro Tático — the exercise diagram editor (training.tactical-board).
 *
 * The interaction model is the shared `boardPress` reducer in @levelup/config
 * (the same one the iOS board drives from its gesture layer); this file turns
 * DOM pointer events into presses, drags and previews, and lays the shell out.
 * Tabs for modes that are not shipped are not rendered rather than disabled
 * (rule 2). Controlled: `value` may be a legacy v1 diagram, a v2 diagram or
 * undefined — it is upgraded on read (rule 12) and every mutation calls
 * `onChange` with a v2 diagram.
 */

/** Modes rendered as tabs, in canvas order. */
const SHIPPED_MODES: BoardMode[] = ["magnetic", "game", "basket"];

const TOOL_ICONS: Record<BoardTool, typeof MousePointer2> = {
  select: MousePointer2,
  ball: Circle,
  movement: Route,
  cone: Triangle,
  player: User,
  feeder: ShoppingBasket,
  pen: Pencil,
};

function toolLabelKey(mode: BoardMode, tool: BoardTool): string {
  if (tool === "movement" && mode === "basket") return "training.board.tools.move";
  return `training.board.tools.${tool}`;
}

function hintKey(mode: BoardMode, tool: BoardTool): string {
  if (mode === "basket" && tool === "ball") return "training.board.hints.ballBasket";
  if (mode === "basket" && tool === "movement") return "training.board.hints.movementBasket";
  if (mode === "magnetic" && tool === "ball") return "training.board.hints.ballMagnetic";
  if (mode === "magnetic" && tool === "player") return "training.board.hints.playerMagnetic";
  if (mode === "magnetic" && tool === "cone") return "training.board.hints.coneMagnetic";
  return `training.board.hints.${tool}`;
}

interface Props {
  value: AnyCourtDiagram | undefined;
  onChange: (diagram: CourtDiagramV2) => void;
  className?: string;
}

type Drag = { id: string; offset: Point; position: Point; moved: boolean };

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function TacticalBoard({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const diagram = useMemo(() => upgradeCourtDiagram(value), [value]);
  const history = useBoardHistory<CourtDiagramV2>(diagram, onChange);

  const [state, setState] = useState<BoardState>(INITIAL_BOARD_STATE);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [stroke, setStroke] = useState<Point[] | null>(null);
  const [confirmMode, setConfirmMode] = useState<BoardMode | null>(null);

  // ── playback (rules 19–20) ────────────────────────────────────────────────
  const [playback, setPlayback] = useState<{ step: number; t: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    setPlayback(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  /** Any edit stops playback and returns the board to the editing view (rule 20). */
  const commit = useCallback(
    (next: CourtDiagramV2) => {
      stopPlayback();
      history.commit(next);
    },
    [history, stopPlayback]
  );
  const undo = () => {
    stopPlayback();
    history.undo();
  };
  const canUndo = history.canUndo;

  const startAuto = () => {
    if (diagram.steps.length === 0) return;
    stopPlayback();
    const startedAt = Date.now();
    const total = diagram.steps.length;
    setPlaying(true);
    setPlayback({ step: 0, t: 0 });
    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const step = Math.floor(elapsed / STEP_DURATION_MS);
      if (step >= total) {
        stopPlayback();
        return;
      }
      setPlayback({ step, t: (elapsed % STEP_DURATION_MS) / STEP_DURATION_MS });
    }, 16);
  };

  /** Passo: the end state of the next step, then the starting position again (rule 19). */
  const stepForward = () => {
    if (diagram.steps.length === 0) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    setPlayback((p) => {
      if (!p || p.t === 0) return { step: 0, t: 1 };
      return p.step + 1 < diagram.steps.length ? { step: p.step + 1, t: 1 } : { step: 0, t: 0 };
    });
  };

  const goToStep = (index: number) => {
    stopPlayback();
    setState((s) => boardSetStep(s, diagram, index));
    setDrag(null);
  };

  const pointOf = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    return clampPercent(clientToPercent(e.clientX, e.clientY, svg.getBoundingClientRect()));
  }, []);

  const apply = (r: { state: BoardState; diagram?: CourtDiagramV2 }) => {
    setState(r.state);
    if (r.diagram) commit(r.diagram);
  };

  const selectTool = (tool: BoardTool) => {
    setState((s) => boardSelectTool(s, tool));
    setDrag(null);
  };

  const switchMode = (mode: BoardMode) => {
    commit(boardSwitchMode(diagram, mode));
    setState((s) => boardSelectTool(s, defaultToolForMode(mode)));
    setDrag(null);
    setConfirmMode(null);
  };

  const requestMode = (mode: BoardMode) => {
    if (mode === diagram.mode) return;
    if (boardHasContent(diagram)) setConfirmMode(mode);
    else switchMode(mode);
  };

  // ── court (background) ────────────────────────────────────────────────────
  const onCourtPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (state.tool === "pen") {
      setStroke([pointOf(e)]);
      try {
        svgRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom */
      }
      return;
    }
    apply(boardPress(diagram, state, pointOf(e), null));
  };

  const onCourtPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (stroke) {
      const pt = pointOf(e);
      if (distance(pt, stroke[stroke.length - 1]) > 0.3) setStroke([...stroke, pt]);
      return;
    }
    if (drag) {
      const pt = pointOf(e);
      const position = clampPercent({ x: pt.x - drag.offset.x, y: pt.y - drag.offset.y });
      const moved = drag.moved || distance(position, drag.position) > 0.5;
      setDrag({ ...drag, position, moved });
      return;
    }
    if (state.pending) {
      const pt = pointOf(e);
      if (distance(pt, state.pending.from) > 0.5) setState({ ...state, pending: { ...state.pending, to: pt } });
    }
  };

  const onCourtPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (stroke) {
      const points = [...stroke, pointOf(e)];
      setStroke(null);
      commit(boardStrokeEnd(diagram, points, state.color));
      return;
    }
    if (drag) {
      if (drag.moved) commit(boardDragEnd(diagram, drag.id, drag.position, state));
      setDrag(null);
      return;
    }
    if (state.pending?.kind === "ball" && state.pending.to) {
      // drag-to-draw: the path ends where the pointer was released
      apply(boardPress(diagram, state, pointOf(e), null));
    }
  };

  // ── pieces ────────────────────────────────────────────────────────────────
  const onPiecePointerDown = (piece: Piece, e: React.PointerEvent<SVGGElement>) => {
    if (piece.kind === "stroke") return;
    if (state.tool === "pen") return; // the court handler starts the stroke underneath
    if (playback) return; // pieces are not editable mid-playback
    e.stopPropagation();
    const pt = pointOf(e);
    const r = boardPress(diagram, state, pt, piece);
    apply(r);
    if (r.dragId) {
      setDrag({ id: piece.id, offset: { x: pt.x - piece.x, y: pt.y - piece.y }, position: { x: piece.x, y: piece.y }, moved: false });
      try {
        svgRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* jsdom */
      }
    }
  };

  const deleteSelected = () => apply(boardDeleteSelected(diagram, state));

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

  const mode = diagram.mode;
  const tools = toolsForMode(mode);
  // What the court shows: the frame being played back, or the pieces where the current step starts.
  const stepPieces = useMemo(() => piecesAtStep(diagram, state.stepIndex), [diagram, state.stepIndex]);
  const frame = playback ? interpolateStep(diagram, playback.step, playback.t) : null;
  const viewDiagram: CourtDiagramV2 = frame ? { ...diagram, pieces: frame.pieces, steps: [] } : { ...diagram, pieces: stepPieces };
  const steps = diagram.steps.length;
  const selectedPiece = state.selectedId ? diagram.pieces.find((p) => p.id === state.selectedId) : undefined;
  const canDelete = !!selectedPiece && boardDeleteSelected(diagram, state).diagram !== undefined;
  const canAddPlayer = mode === "basket" && playerCount(diagram) < MAX_BASKET_PLAYERS;

  return (
    <div
      data-tactical-board
      data-testid="tactical-board"
      data-mode={mode}
      className={cn("rounded-[20px] bg-sidebar text-sidebar-foreground shadow-lg overflow-hidden", className)}
    >
      {/* header */}
      <div className="flex items-baseline gap-2 px-6 py-4 border-b border-white/10">
        <span className="font-bold text-base tracking-wide text-white">{t("training.board.brand")}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70">· {t("training.board.title")}</span>
      </div>

      {/* mode tabs */}
      <div role="tablist" aria-label={t("training.board.title")} className="flex border-b border-white/10">
        {SHIPPED_MODES.map((m) => {
          const active = mode === m || (m === "game" && !SHIPPED_MODES.includes(mode));
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`board-tab-${m}`}
              onClick={() => requestMode(m)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 px-3 py-3.5 border-b-2 transition-colors",
                active ? "border-primary bg-primary/15 text-white" : "border-transparent text-sidebar-foreground/70 hover:text-white"
              )}
            >
              <span className="text-sm font-bold">{t(`training.board.modes.${m}.title`)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{t(`training.board.modes.${m}.subtitle`)}</span>
            </button>
          );
        })}
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-3.5 pb-2">
        <div role="radiogroup" aria-label={t("training.board.title")} className="flex flex-wrap gap-2">
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool];
            const active = state.tool === tool;
            const label = t(toolLabelKey(mode, tool));
            return (
              <button
                key={tool}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                data-testid={`board-tool-${tool}`}
                onClick={() => selectTool(tool)}
                className={cn(
                  "flex min-w-[58px] flex-col items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.06em] transition-colors",
                  active ? "border-primary bg-primary/20 text-white" : "border-white/15 text-sidebar-foreground/70 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {mode === "magnetic" ? (
          <>
            <div className="mx-1 h-6 w-px bg-white/15" aria-hidden />
            <div role="radiogroup" aria-label={t("training.board.colors.blue")} data-testid="board-swatches" className="flex items-center gap-2">
              {SWATCHES.map((c) => {
                const active = state.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(`training.board.colors.${c}`)}
                    data-testid={`board-color-${c}`}
                    onClick={() => setState((s) => boardSetColor(s, c))}
                    className={cn("h-5 w-5 rounded-full border-2 transition-shadow", active ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" : "border-white/30")}
                    style={{ background: swatch(c) }}
                  />
                );
              })}
            </div>
          </>
        ) : null}
        {mode === "basket" ? (
          <>
            <div className="mx-1 h-6 w-px bg-white/15" aria-hidden />
            <button
              type="button"
              data-testid="board-add-players"
              disabled={!canAddPlayer}
              onClick={() => commit(addPlayer(diagram))}
              className="flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-xs font-semibold text-sidebar-foreground/70 hover:text-white disabled:opacity-40 disabled:hover:text-sidebar-foreground/70"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              {t("training.board.addPlayers")}
            </button>
          </>
        ) : null}
        <div className="flex-1" />
        {canDelete ? (
          <button
            type="button"
            aria-label={t("training.board.deleteSelected")}
            title={t("training.board.deleteSelected")}
            data-testid="board-delete"
            onClick={deleteSelected}
            className="rounded-full p-2 text-sidebar-foreground/70 hover:text-white"
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t("training.board.undo")}
          title={t("training.board.undo")}
          data-testid="board-undo"
          disabled={!canUndo}
          onClick={undo}
          className="rounded-full p-2 text-sidebar-foreground/70 hover:text-white disabled:opacity-40 disabled:hover:text-sidebar-foreground/70"
        >
          <Undo2 className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
      <p data-testid={`board-hint-${state.tool}`} className="px-6 pb-3 text-xs text-sidebar-foreground/70">
        {t(hintKey(mode, state.tool))}
      </p>

      {/* steps + playback (rules 18–20) */}
      <div data-testid="board-steps" className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <button type="button" aria-label={t("training.board.playback.prevStep")} data-testid="board-prev-step" disabled={state.stepIndex === 0} onClick={() => goToStep(state.stepIndex - 1)} className="rounded-full p-1.5 text-sidebar-foreground/70 hover:text-white disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span data-testid="board-step-indicator" className="min-w-[96px] text-center text-xs font-semibold text-white">
          {t("training.board.playback.stepOf", { n: state.stepIndex + 1, m: stepCount(diagram) })}
        </span>
        <button type="button" aria-label={t("training.board.playback.nextStep")} data-testid="board-next-step" disabled={state.stepIndex >= stepCount(diagram) - 1} onClick={() => goToStep(state.stepIndex + 1)} className="rounded-full p-1.5 text-sidebar-foreground/70 hover:text-white disabled:opacity-40">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" aria-label={t("training.board.playback.addStep")} title={t("training.board.playback.addStep")} data-testid="board-add-step" onClick={() => { const r = boardAddStep(diagram, state); commit(r.diagram); setState(r.state); }} className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-sidebar-foreground/70 hover:text-white">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("training.board.playback.addStep")}
        </button>
        <button type="button" aria-label={t("training.board.playback.deleteStep")} title={t("training.board.playback.deleteStep")} data-testid="board-delete-step" disabled={steps === 0} onClick={() => { const r = boardDeleteStep(diagram, state); commit(r.diagram); setState(r.state); }} className="rounded-full p-1.5 text-sidebar-foreground/70 hover:text-white disabled:opacity-40">
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex-1" />
        <button type="button" aria-label={t("training.board.playback.step")} data-testid="board-passo" disabled={steps === 0} onClick={stepForward} className="rounded-full bg-secondary px-4 py-2 text-xs font-bold tracking-[0.06em] text-secondary-foreground disabled:opacity-40">
          {t("training.board.playback.step")}
        </button>
        <button type="button" aria-label={playing ? t("training.board.playback.stop") : t("training.board.playback.auto")} aria-pressed={playing} data-testid="board-auto" disabled={steps === 0} onClick={playing ? stopPlayback : startAuto} className="rounded-full bg-primary px-5 py-2 text-xs font-bold tracking-[0.06em] text-primary-foreground disabled:opacity-40">
          {playing ? t("training.board.playback.stop") : t("training.board.playback.auto")}
        </button>
      </div>

      {/* court */}
      <div className="flex justify-center px-6 pb-5 pt-1">
        <div className="relative w-full max-w-[340px] rounded-[10px] bg-[#0D1B31] px-4 pt-[22px] pb-[22px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <span className="pointer-events-none absolute left-0 right-0 top-1 text-center text-[9px] font-semibold tracking-[0.16em] text-white/30">{t("training.board.teams.a")}</span>
          <span className="pointer-events-none absolute left-0 right-0 bottom-1 text-center text-[9px] font-semibold tracking-[0.16em] text-white/30">{t("training.board.teams.b")}</span>
          <CourtSurface
            ref={svgRef}
            diagram={viewDiagram}
            stepIndex={state.stepIndex}
            playbackBall={frame?.ball ?? null}
            selectedId={playback ? null : state.selectedId}
            dragOverride={drag ? { id: drag.id, position: drag.position } : null}
            pending={state.pending}
            liveStroke={stroke ? { color: state.color as PieceColor, points: stroke } : null}
            ariaLabel={t("training.board.canvasAria")}
            ballHandleLabel={t("training.board.ballStyleToggle")}
            className={cn(state.tool === "select" ? "cursor-default" : "cursor-crosshair")}
            onPointerDown={onCourtPointerDown}
            onPointerMove={onCourtPointerMove}
            onPointerUp={onCourtPointerUp}
            onPiecePointerDown={onPiecePointerDown}
            onBallHandleClick={() => commit(boardToggleBallStyle(diagram, state.stepIndex))}
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

      {/* mode switch confirmation (rule 3) */}
      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => !open && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("training.board.switchMode.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("training.board.switchMode.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="board-switch-confirm" onClick={() => confirmMode && switchMode(confirmMode)}>
              {t("training.board.switchMode.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
