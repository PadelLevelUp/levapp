import { Ionicons } from "@expo/vector-icons";
import {
  HIT_RADIUS,
  INITIAL_BOARD_STATE,
  VIEW_H,
  VIEW_W,
  ballHandleHit,
  boardDeleteSelected,
  boardDragEnd,
  boardPress,
  boardSelectTool,
  boardToggleBallStyle,
  clampPercent,
  clientToPercent,
  hitTestPiece,
  lightTheme,
  popHistory,
  pushHistory,
  upgradeCourtDiagram,
  type BoardState,
  type BoardTool,
} from "@levelup/config";
import type { AnyCourtDiagram, BoardMode, CourtDiagramV2, Point } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
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
const SHIPPED_MODES: BoardMode[] = ["game"];
const TOOLS: { tool: BoardTool; icon: keyof typeof Ionicons.glyphMap }[] = [
  { tool: "select", icon: "hand-left-outline" },
  { tool: "ball", icon: "ellipse-outline" },
  { tool: "movement", icon: "footsteps-outline" },
  { tool: "cone", icon: "triangle-outline" },
];

type Drag = { id: string; offset: Point; position: Point; moved: boolean };

type Live = {
  diagram: CourtDiagramV2;
  state: BoardState;
  layout: { width: number; height: number };
  drag: Drag | null;
  commit: (next: CourtDiagramV2) => void;
  setState: (s: BoardState) => void;
  setDrag: (d: Drag | null) => void;
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
  const [layout, setLayout] = React.useState({ width: 0, height: 0 });
  const history = React.useRef<CourtDiagramV2[]>([]);
  const [canUndo, setCanUndo] = React.useState(false);

  const commit = React.useCallback(
    (next: CourtDiagramV2) => {
      history.current = pushHistory(history.current, diagram);
      setCanUndo(true);
      onChange(next);
    },
    [diagram, onChange]
  );

  const undo = () => {
    const { stack, value: previous } = popHistory(history.current);
    history.current = stack;
    setCanUndo(stack.length > 0);
    if (previous) onChange(previous);
  };

  const live = React.useRef<Live>({ diagram, state, layout, drag, commit, setState, setDrag });
  live.current = { diagram, state, layout, drag, commit, setState, setDrag };

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
    const { diagram: d, state: s, commit: c, setState: set, setDrag: sd } = live.current;
    const pt = toPercent(x, y);
    const radius = touchRadius();
    if (ballHandleHit(d, pt, radius)) {
      c(boardToggleBallStyle(d));
      return;
    }
    const hit = hitTestPiece(d.pieces, pt, radius);
    const result = boardPress(d, s, pt, hit);
    set(result.state);
    if (result.diagram) c(result.diagram);
    if (result.dragId && hit && hit.kind !== "stroke") {
      sd({ id: hit.id, offset: { x: pt.x - hit.x, y: pt.y - hit.y }, position: { x: hit.x, y: hit.y }, moved: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMove = React.useCallback((x: number, y: number) => {
    const { drag: dr, state: s, setState: set, setDrag: sd } = live.current;
    const pt = toPercent(x, y);
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
    const { diagram: d, drag: dr, state: s, commit: c, setState: set, setDrag: sd } = live.current;
    if (dr) {
      if (dr.moved) c(boardDragEnd(d, dr.id, dr.position));
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

  const deleteSelected = () => {
    const r = boardDeleteSelected(diagram, state);
    setState(r.state);
    if (r.diagram) commit(r.diagram);
  };

  const selectedPiece = state.selectedId ? diagram.pieces.find((p) => p.id === state.selectedId) : undefined;
  const canDelete = !!selectedPiece && selectedPiece.kind !== "player" && selectedPiece.kind !== "feeder";
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
        {SHIPPED_MODES.map((mode) => {
          const active = diagram.mode === mode || (mode === "game" && !SHIPPED_MODES.includes(diagram.mode));
          return (
            <Pressable
              key={mode}
              testID={`board-tab-${mode}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className={cn("flex-1 items-center gap-1 border-b-2 px-3 py-3", active ? "border-primary bg-primary/15" : "border-transparent")}
            >
              <Text className={cn("font-sans-bold text-[13px]", active ? "text-white" : "text-white/70")}>{t(`training.board.modes.${mode}.title`)}</Text>
              <Text className="font-sans-semibold text-[10px] uppercase tracking-[1px] text-white/60">{t(`training.board.modes.${mode}.subtitle`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* toolbar */}
      <View className="flex-row items-center px-3 pt-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="flex-row gap-2" accessibilityRole="radiogroup">
          {TOOLS.map(({ tool, icon }) => {
            const active = state.tool === tool;
            return (
              <Pressable
                key={tool}
                testID={`board-tool-${tool}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={t(`training.board.tools.${tool}`)}
                onPress={() => selectTool(tool)}
                className={cn("min-w-[58px] items-center gap-1 rounded-[10px] border px-3 py-2", active ? "border-primary bg-primary/20" : "border-white/15")}
              >
                <Ionicons name={icon} size={20} color={active ? "#fff" : "rgba(255,255,255,0.7)"} />
                <Text className={cn("font-sans-semibold text-[9px] uppercase tracking-[0.5px]", active ? "text-white" : "text-white/70")}>
                  {t(`training.board.tools.${tool}`)}
                </Text>
              </Pressable>
            );
          })}
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
        {t(`training.board.hints.${state.tool}`)}
      </Text>

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
                  diagram={diagram}
                  selectedId={state.selectedId}
                  dragOverride={drag ? { id: drag.id, position: drag.position } : null}
                  pending={state.pending}
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
