import { Ionicons } from "@expo/vector-icons";
import {
  addPlayer,
  ballHandleHit,
  boardAddStep,
  boardDeleteSelected,
  boardDeleteStep,
  boardDragEnd,
  boardHasContent,
  boardMoveBallPath,
  boardPress,
  boardRemoveBallPath,
  boardSelectTool,
  boardSetColor,
  boardSetStep,
  boardStrokeEnd,
  boardSwitchMode,
  boardToggleBallStyle,
  clampPercent,
  clientToPercent,
  defaultToolForMode,
  HIT_RADIUS,
  hitTestPiece,
  INITIAL_BOARD_STATE,
  interpolateStep,
  lightTheme,
  MAX_BASKET_PLAYERS,
  piecesAtStep,
  playbackFrameAt,
  playerCount,
  popHistory,
  pushHistory,
  stepBalls,
  stepCount,
  SWATCHES,
  swatchHex as swatch,
  toolsForMode,
  type BoardState,
  type BoardTool,
  upgradeCourtDiagram,
  VIEW_H,
  VIEW_W,
} from "@levelup/config";
import type { AnyCourtDiagram, BoardMode, CourtDiagramV2, PieceColor, Point } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { CourtSurface } from "./court-surface";

/**
 * Quadro Tático on iOS — the touch port of
 * apps/web/src/components/training/board/TacticalBoard.tsx.
 *
 * The interaction model is the shared `boardPress` reducer in
 * @levelup/config (so web and iOS cannot drift on behaviour); this file only
 * turns a Pan gesture into presses, drags and previews, and lays the shell
 * out with NativeWind. Hit-testing is done in JS against the diagram (there
 * is no DOM `e.target` here), with a 22pt minimum touch radius.
 */

const NAVY = "#0D1B31";
const MIN_TOUCH_RADIUS_PT = 22;
/** Modes rendered as tabs, in canvas order. */
const SHIPPED_MODES: BoardMode[] = ["magnetic", "game", "basket"];
const TOOL_ICONS: Record<BoardTool, keyof typeof Ionicons.glyphMap> = {
  select: "hand-left-outline",
  ball: "ellipse-outline",
  movement: "footsteps-outline",
  cone: "triangle-outline",
  player: "person-outline",
  feeder: "basket-outline",
  pen: "pencil-outline",
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

type Drag = { id: string; offset: Point; position: Point; moved: boolean };

type Live = {
  diagram: CourtDiagramV2;
  state: BoardState;
  playback: boolean;
  layout: { width: number; height: number };
  drag: Drag | null;
  stroke: Point[] | null;
  commit: (next: CourtDiagramV2) => void;
  setState: (s: BoardState) => void;
  setDrag: (d: Drag | null) => void;
  setStroke: (s: Point[] | null) => void;
};

interface Props {
  value: AnyCourtDiagram | undefined;
  onChange: (diagram: CourtDiagramV2) => void;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function TacticalBoard({ value, onChange }: Props) {
  const { t } = useTranslation();
  const diagram = React.useMemo(() => upgradeCourtDiagram(value), [value]);
  const [state, setState] = React.useState<BoardState>(INITIAL_BOARD_STATE);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [stroke, setStroke] = React.useState<Point[] | null>(null);
  const [layout, setLayout] = React.useState({ width: 0, height: 0 });
  const history = React.useRef<CourtDiagramV2[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);

  // ── playback (rules 19–20) ────────────────────────────────────────────────
  const [playback, setPlayback] = React.useState<{ step: number; t: number } | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = React.useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    setPlayback(null);
  }, []);

  React.useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  /** Any edit stops playback and returns the board to the editing view (rule 20). */
  const commit = React.useCallback(
    (next: CourtDiagramV2) => {
      stopPlayback();
      history.current = pushHistory(history.current, diagram);
      setCanUndo(true);
      onChange(next);
    },
    [diagram, onChange, stopPlayback]
  );

  const undo = () => {
    stopPlayback();
    const { stack, value: previous } = popHistory(history.current);
    history.current = stack;
    setCanUndo(stack.length > 0);
    if (previous) onChange(previous);
  };

  const startAuto = () => {
    if (diagram.steps.length === 0) return;
    stopPlayback();
    const startedAt = Date.now();
    setPlaying(true);
    setPlayback({ step: 0, t: 0 });
    timer.current = setInterval(() => {
      // PAD-289 (rule 20): a step lasts 800 ms per ball path; the shared scheduler decides.
      const frame = playbackFrameAt(diagram, Date.now() - startedAt);
      if (!frame) {
        stopPlayback();
        return;
      }
      setPlayback(frame);
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
    setState(boardSetStep(state, diagram, index));
    setDrag(null);
  };

  const live = React.useRef<Live>({ diagram, state, playback: playback !== null, layout, drag, stroke, commit, setState, setDrag, setStroke });
  live.current = { diagram, state, playback: playback !== null, layout, drag, stroke, commit, setState, setDrag, setStroke };

  const toPercent = (x: number, y: number): Point => {
    const { layout: l } = live.current;
    return clampPercent(clientToPercent(x, y, { left: 0, top: 0, width: l.width, height: l.height }));
  };

  /** Touch radius in percent: at least HIT_RADIUS, at least 22pt on screen. */
  const touchRadius = (): number => {
    const { layout: l } = live.current;
    const scale = l.width > 0 ? Math.min(l.width / VIEW_W, l.height / VIEW_H) : 1;
    const pt = ((MIN_TOUCH_RADIUS_PT / scale) * 100) / VIEW_W;
    return Math.max(HIT_RADIUS, pt);
  };

  const handleDown = React.useCallback((x: number, y: number) => {
    const { diagram: d, state: s, playback: inPlayback, commit: c, setState: set, setDrag: sd, setStroke: ss } = live.current;
    if (inPlayback) return; // pieces are not editable mid-playback
    const pt = toPercent(x, y);
    if (s.tool === "pen") {
      ss([pt]);
      return;
    }
    const radius = touchRadius();
    const handleIndex = ballHandleHit(d, pt, radius, s.stepIndex);
    if (handleIndex >= 0) {
      c(boardToggleBallStyle(d, s.stepIndex, handleIndex));
      return;
    }
    const hit = hitTestPiece(piecesAtStep(d, s.stepIndex), pt, radius);
    const result = boardPress(d, s, pt, hit);
    set(result.state);
    if (result.diagram) c(result.diagram);
    if (result.dragId && hit && hit.kind !== "stroke") {
      sd({ id: hit.id, offset: { x: pt.x - hit.x, y: pt.y - hit.y }, position: { x: hit.x, y: hit.y }, moved: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMove = React.useCallback((x: number, y: number) => {
    const { drag: dr, state: s, stroke: st, setState: set, setDrag: sd, setStroke: ss } = live.current;
    const pt = toPercent(x, y);
    if (st) {
      if (distance(pt, st[st.length - 1]) > 0.3) ss([...st, pt]);
      return;
    }
    if (dr) {
      const position = clampPercent({ x: pt.x - dr.offset.x, y: pt.y - dr.offset.y });
      const moved = dr.moved || distance(position, dr.position) > 0.5;
      sd({ ...dr, position, moved });
      return;
    }
    if (s.pending && distance(pt, s.pending.from) > 0.5) {
      set({ ...s, pending: { ...s.pending, to: pt } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUp = React.useCallback((x: number, y: number) => {
    const { diagram: d, drag: dr, state: s, stroke: st, commit: c, setState: set, setDrag: sd, setStroke: ss } = live.current;
    if (st) {
      ss(null);
      c(boardStrokeEnd(d, [...st, toPercent(x, y)], s.color));
      return;
    }
    if (dr) {
      if (dr.moved) c(boardDragEnd(d, dr.id, dr.position, s));
      sd(null);
      return;
    }
    if (s.pending?.kind === "ball" && s.pending.to) {
      // drag-to-draw: the path ends where the finger lifted
      const result = boardPress(d, s, toPercent(x, y), null);
      set(result.state);
      if (result.diagram) c(result.diagram);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => handleDown(e.x, e.y))
        .onUpdate((e) => handleMove(e.x, e.y))
        .onFinalize((e) => handleUp(e.x, e.y)),
    [handleDown, handleMove, handleUp]
  );

  const selectTool = (tool: BoardTool) => {
    setState(boardSelectTool(state, tool));
    setDrag(null);
  };

  const switchMode = (mode: BoardMode) => {
    commit(boardSwitchMode(diagram, mode));
    setState(boardSelectTool(state, defaultToolForMode(mode)));
    setDrag(null);
  };

  const requestMode = (mode: BoardMode) => {
    if (mode === diagram.mode) return;
    if (!boardHasContent(diagram)) {
      switchMode(mode);
      return;
    }
    Alert.alert(t("training.board.switchMode.title"), t("training.board.switchMode.body"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("training.board.switchMode.confirm"), style: "destructive", onPress: () => switchMode(mode) },
    ]);
  };

  const deleteSelected = () => {
    const r = boardDeleteSelected(diagram, state);
    setState(r.state);
    if (r.diagram) commit(r.diagram);
  };

  const mode = diagram.mode;
  const tools = toolsForMode(mode);
  const stepPieces = React.useMemo(() => piecesAtStep(diagram, state.stepIndex), [diagram, state.stepIndex]);
  const frame = playback ? interpolateStep(diagram, playback.step, playback.t) : null;
  const viewDiagram: CourtDiagramV2 = frame ? { ...diagram, pieces: frame.pieces, steps: [] } : { ...diagram, pieces: stepPieces };
  const steps = diagram.steps.length;
  // PAD-289 (rule 23): the current step's ball paths, for the list under the step strip.
  const balls = mode === "magnetic" ? [] : stepBalls(diagram.steps[state.stepIndex]);
  const canDelete = !!state.selectedId && boardDeleteSelected(diagram, state).diagram !== undefined;
  const canAddPlayer = mode === "basket" && playerCount(diagram) < MAX_BASKET_PLAYERS;
  const courtHeight = layout.width > 0 ? (layout.width * VIEW_H) / VIEW_W : 0;

  return (
    <View testID="tactical-board" className="overflow-hidden rounded-[20px]" style={{ backgroundColor: lightTheme.sidebarBackground }}>
      {/* header */}
      <View className="flex-row items-baseline gap-2 border-b border-white/10 px-4 py-3.5">
        <Text className="font-display text-[15px] text-white">{t("training.board.brand")}</Text>
        <Text className="font-sans-semibold text-[11px] uppercase tracking-[1px] text-white/70">· {t("training.board.title")}</Text>
      </View>

      {/* mode tabs */}
      <View className="flex-row border-b border-white/10" accessibilityRole="tablist">
        {SHIPPED_MODES.map((m) => {
          const active = mode === m || (m === "game" && !SHIPPED_MODES.includes(mode));
          return (
            <Pressable
              key={m}
              testID={`board-tab-${m}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => requestMode(m)}
              className={cn("flex-1 items-center gap-1 border-b-2 px-3 py-3", active ? "border-primary bg-primary/15" : "border-transparent")}
            >
              <Text className={cn("font-sans-bold text-[13px]", active ? "text-white" : "text-white/70")}>{t(`training.board.modes.${m}.title`)}</Text>
              <Text className="font-sans-semibold text-[10px] uppercase tracking-[1px] text-white/60">{t(`training.board.modes.${m}.subtitle`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* toolbar */}
      <View className="flex-row items-center px-3 pt-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="flex-row items-center gap-2" accessibilityRole="radiogroup">
          {tools.map((tool) => {
            const active = state.tool === tool;
            const label = t(toolLabelKey(mode, tool));
            return (
              <Pressable
                key={tool}
                testID={`board-tool-${tool}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={label}
                onPress={() => selectTool(tool)}
                className={cn("min-w-[58px] items-center gap-1 rounded-[10px] border px-3 py-2", active ? "border-primary bg-primary/20" : "border-white/15")}
              >
                <Ionicons name={TOOL_ICONS[tool]} size={20} color={active ? "#fff" : "rgba(255,255,255,0.7)"} />
                <Text className={cn("font-sans-semibold text-[9px] uppercase tracking-[0.5px]", active ? "text-white" : "text-white/70")}>{label}</Text>
              </Pressable>
            );
          })}
          {mode === "magnetic" ? (
            <View className="ml-1 flex-row items-center gap-2" accessibilityRole="radiogroup" testID="board-swatches">
              {SWATCHES.map((c) => {
                const active = state.color === c;
                return (
                  <Pressable
                    key={c}
                    testID={`board-color-${c}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={t(`training.board.colors.${c}`)}
                    onPress={() => setState(boardSetColor(state, c as PieceColor))}
                    className="h-11 w-8 items-center justify-center"
                  >
                    <View className={cn("h-5 w-5 rounded-full border-2", active ? "border-white" : "border-white/30")} style={{ backgroundColor: swatch(c) }} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {mode === "basket" ? (
            <Pressable
              testID="board-add-players"
              accessibilityRole="button"
              accessibilityLabel={t("training.board.addPlayers")}
              accessibilityState={{ disabled: !canAddPlayer }}
              disabled={!canAddPlayer}
              onPress={() => commit(addPlayer(diagram))}
              className={cn("ml-1 h-11 flex-row items-center gap-1.5 rounded-full border border-white/15 px-3", !canAddPlayer && "opacity-40")}
            >
              <Ionicons name="person-add-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.addPlayersShort")}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <View className="ml-2 flex-row items-center gap-1">
          {canDelete ? (
            <Pressable
              testID="board-delete"
              accessibilityRole="button"
              accessibilityLabel={t("training.board.deleteSelected")}
              onPress={deleteSelected}
              className="h-11 w-11 items-center justify-center rounded-full"
            >
              <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          ) : null}
          <Pressable
            testID="board-undo"
            accessibilityRole="button"
            accessibilityLabel={t("training.board.undo")}
            accessibilityState={{ disabled: !canUndo }}
            disabled={!canUndo}
            onPress={undo}
            className={cn("h-11 w-11 items-center justify-center rounded-full", !canUndo && "opacity-40")}
          >
            <Ionicons name="arrow-undo-outline" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </View>
      <Text testID={`board-hint-${state.tool}`} className="px-4 pb-3 pt-2 text-xs text-white/70">
        {t(hintKey(mode, state.tool))}
      </Text>

      {/* steps + playback (rules 18–20) */}
      <View testID="board-steps" className="flex-row flex-wrap items-center gap-1 px-3 pb-3">
        <Pressable testID="board-prev-step" accessibilityRole="button" accessibilityLabel={t("training.board.playback.prevStep")} disabled={state.stepIndex === 0} onPress={() => goToStep(state.stepIndex - 1)} className={cn("h-11 w-9 items-center justify-center", state.stepIndex === 0 && "opacity-40")}>
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text testID="board-step-indicator" className="min-w-[88px] text-center font-sans-semibold text-xs text-white">
          {t("training.board.playback.stepOf", { n: state.stepIndex + 1, m: stepCount(diagram) })}
        </Text>
        <Pressable testID="board-next-step" accessibilityRole="button" accessibilityLabel={t("training.board.playback.nextStep")} disabled={state.stepIndex >= stepCount(diagram) - 1} onPress={() => goToStep(state.stepIndex + 1)} className={cn("h-11 w-9 items-center justify-center", state.stepIndex >= stepCount(diagram) - 1 && "opacity-40")}>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable testID="board-add-step" accessibilityRole="button" accessibilityLabel={t("training.board.playback.addStep")} onPress={() => { const r = boardAddStep(diagram, state); commit(r.diagram); setState(r.state); }} className="h-11 w-11 items-center justify-center rounded-full border border-white/15">
          <Ionicons name="add" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Pressable testID="board-delete-step" accessibilityRole="button" accessibilityLabel={t("training.board.playback.deleteStep")} disabled={steps === 0} onPress={() => { const r = boardDeleteStep(diagram, state); commit(r.diagram); setState(r.state); }} className={cn("h-11 w-9 items-center justify-center", steps === 0 && "opacity-40")}>
          <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <View className="flex-1" />
        <Pressable testID="board-passo" accessibilityRole="button" accessibilityLabel={t("training.board.playback.step")} disabled={steps === 0} onPress={stepForward} className={cn("h-10 justify-center rounded-full bg-secondary px-4", steps === 0 && "opacity-40")}>
          <Text className="font-sans-bold text-xs text-secondary-foreground">{t("training.board.playback.step")}</Text>
        </Pressable>
        <Pressable testID="board-auto" accessibilityRole="button" accessibilityLabel={playing ? t("training.board.playback.stop") : t("training.board.playback.auto")} accessibilityState={{ selected: playing }} disabled={steps === 0} onPress={playing ? stopPlayback : startAuto} className={cn("ml-1 h-10 justify-center rounded-full bg-primary px-4", steps === 0 && "opacity-40")}>
          <Text className="font-sans-bold text-xs text-primary-foreground">{playing ? t("training.board.playback.stop") : t("training.board.playback.auto")}</Text>
        </Pressable>
      </View>

      {/* ball paths of the current step (PAD-289, rule 23) */}
      {balls.length > 0 ? (
        <View testID="board-balls" className="flex-row flex-wrap items-center gap-2 px-3 pb-3">
          <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.balls.title")}</Text>
          {balls.map((path, i) => (
            <View key={`ball-row-${i}`} testID={`board-ball-${i}`} className="flex-row items-center rounded-full border border-white/15 py-0.5 pl-2.5 pr-1">
              <Text className="mr-1 text-[11px] text-white">
                {t("training.board.balls.item", { n: i + 1 })} · {t(`training.board.balls.${path.style}`)}
              </Text>
              <Pressable testID={`board-ball-${i}-up`} accessibilityRole="button" accessibilityLabel={t("training.board.balls.up", { n: i + 1 })} disabled={i === 0} onPress={() => commit(boardMoveBallPath(diagram, state.stepIndex, i, i - 1))} className={cn("h-9 w-8 items-center justify-center", i === 0 && "opacity-40")}>
                <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <Pressable testID={`board-ball-${i}-down`} accessibilityRole="button" accessibilityLabel={t("training.board.balls.down", { n: i + 1 })} disabled={i === balls.length - 1} onPress={() => commit(boardMoveBallPath(diagram, state.stepIndex, i, i + 1))} className={cn("h-9 w-8 items-center justify-center", i === balls.length - 1 && "opacity-40")}>
                <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <Pressable testID={`board-ball-${i}-remove`} accessibilityRole="button" accessibilityLabel={t("training.board.balls.remove", { n: i + 1 })} onPress={() => commit(boardRemoveBallPath(diagram, state.stepIndex, i))} className="h-9 w-8 items-center justify-center">
                <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* court */}
      <View className="items-center px-4 pb-4">
        <View className="relative w-full max-w-[340px] rounded-[10px] px-4 py-[22px]" style={{ backgroundColor: NAVY }}>
          <Text className="absolute left-0 right-0 top-1 text-center font-sans-semibold text-[9px] tracking-[2px] text-white/30">{t("training.board.teams.a")}</Text>
          <Text className="absolute bottom-1 left-0 right-0 text-center font-sans-semibold text-[9px] tracking-[2px] text-white/30">{t("training.board.teams.b")}</Text>
          <GestureDetector gesture={pan}>
            <View
              accessible
              accessibilityLabel={t("training.board.canvasAria")}
              style={{ width: "100%", height: courtHeight || undefined, aspectRatio: courtHeight ? undefined : VIEW_W / VIEW_H }}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setLayout((prev) => (Math.abs(prev.width - width) > 0.5 || Math.abs(prev.height - height) > 0.5 ? { width, height } : prev));
              }}
            >
              {layout.width > 0 ? (
                <CourtSurface
                  diagram={viewDiagram}
                  stepIndex={state.stepIndex}
                  playbackBall={frame?.ball ?? null}
                  selectedId={playback ? null : state.selectedId}
                  dragOverride={drag ? { id: drag.id, position: drag.position } : null}
                  pending={state.pending}
                  liveStroke={stroke ? { color: state.color, points: stroke } : null}
                  width={layout.width}
                  height={layout.height}
                />
              ) : null}
            </View>
          </GestureDetector>
        </View>
      </View>

      {/* legend */}
      <View className="flex-row flex-wrap gap-4 border-t border-white/10 px-4 pb-4 pt-2.5">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="arrow-forward-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.legend.ball")}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="remove-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.legend.movement")}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: "#4A9BFF" }} />
          <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.legend.teamA")}</Text>
          <View className="ml-2 h-3 w-3 rounded-full" style={{ backgroundColor: "#D3453B" }} />
          <Text className="font-sans-semibold text-[11px] text-white/70">{t("training.board.legend.teamB")}</Text>
        </View>
      </View>
    </View>
  );
}
