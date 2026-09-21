import {
  EVOLUTION_LINE_COLOR,
  chartPoints,
  competencyLabel,
  defaultEvolutionCompetency,
  deltaPresentation,
  evolutionMonthLabels,
  formatMean,
  lightTheme,
} from "@levelup/config";
import { useHeldWhile, usePlayerEvolution } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line as SvgLine, Polyline, Text as SvgText } from "react-native-svg";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface EvolutionSectionProps {
  playerId: string;
  competencies: EvaluationCompetency[];
  competenciesWithData: number[];
  /**
   * True while the evaluation form below is open. The section then keeps the shape it
   * had — same pills, same figures — so a rating saved on tap never moves the form
   * under the coach's finger; it follows the server again the moment the form closes.
   */
  held?: boolean;
}

const HEIGHT = 170;
const BOX = { paddingX: 28, paddingTop: 14, paddingBottom: 28 };

/**
 * "Evolução" on iOS (evaluations.evolution, PAD-375) — the same response and the same
 * presentation helpers as web's `EvaluationEvolution`; the server computes every
 * figure (R-048). One small polyline with `react-native-svg` instead of a chart
 * library: a 2px line, 8pt markers with a surface ring, the competency's OWN scale on
 * the y axis. There is no hover on a phone, so a point is a 44pt tap target and its
 * value shows in a caption under the chart; the last point opens selected.
 */
export function EvolutionSection({ playerId, competencies, competenciesWithData: latestWithData, held = false }: EvolutionSectionProps) {
  const competenciesWithData = useHeldWhile(latestWithData, held, playerId);
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = React.useState<number | null>(() => defaultEvolutionCompetency(competenciesWithData));
  React.useEffect(() => {
    setSelected((now) => defaultEvolutionCompetency(competenciesWithData, now));
  }, [playerId, competenciesWithData]);

  const evolution = usePlayerEvolution(playerId, selected);
  // Before the early return below: a hook may never come after one.
  const data = useHeldWhile(evolution.data, held, `${playerId}:${selected}`);
  const [width, setWidth] = React.useState(0);
  const [active, setActive] = React.useState<number | null>(null);
  React.useEffect(() => setActive(null), [selected]);

  if (competenciesWithData.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground" testID="evaluation-evolution-empty">
        {t("players.evaluationHistory.evolutionEmpty")}
      </Text>
    );
  }

  const labelOf = (id: number) => {
    const competency = competencies.find((c) => c.id === id);
    return competency ? competencyLabel(t, competency) : `#${id}`;
  };
  const months = data ? evolutionMonthLabels(data.series, i18n.language) : [];
  const delta = data ? deltaPresentation(data.delta) : null;
  const sinceLabel =
    delta && data ? evolutionMonthLabels([{ month: delta.sinceMonth, mean: 0 }, ...data.series], i18n.language)[0] : "";
  const points =
    data && width > 0
      ? chartPoints(data.series, { scaleMin: data.scaleMin, scaleMax: data.scaleMax, width, height: HEIGHT, ...BOX })
      : [];
  const shown = data && data.series.length > 0 ? active ?? data.series.length - 1 : null;
  const plotBottom = HEIGHT - BOX.paddingBottom;

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2" accessibilityLabel={t("players.evaluationHistory.evolutionPills")}>
        {competenciesWithData.map((id) => (
          <Pressable
            key={id}
            onPress={() => setSelected(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === id }}
            testID={`evolution-pill-${id}`}
            className={cn(
              "min-h-11 justify-center rounded-full border px-4",
              selected === id ? "border-primary bg-primary" : "border-border bg-background"
            )}
          >
            <Text className={cn("text-sm", selected === id ? "text-primary-foreground" : "text-foreground")}>{labelOf(id)}</Text>
          </Pressable>
        ))}
      </View>

      {evolution.isLoading ? <Skeleton className="h-44 w-full" /> : null}
      {evolution.isError && !(held && data) ? (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {t("players.evaluationHistory.evolutionLoadFailed")}
        </Text>
      ) : null}

      {data && selected !== null ? (
        <>
          <View
            onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t("players.evaluationHistory.chartLabel", {
              name: labelOf(selected), min: data.scaleMin, max: data.scaleMax,
            })}
            // The scale and the point count ride on the testID: Maestro reads ids, not props.
            testID={`evolution-chart-${data.scaleMin}-${data.scaleMax}-${data.series.length}`}
            style={{ height: HEIGHT }}
          >
            {width > 0 ? (
              <Svg width={width} height={HEIGHT}>
                {/* hairline, recessive: the scale's two ends */}
                <SvgLine x1={BOX.paddingX} x2={width - BOX.paddingX} y1={BOX.paddingTop} y2={BOX.paddingTop} stroke={lightTheme.border} strokeWidth={1} />
                <SvgLine x1={BOX.paddingX} x2={width - BOX.paddingX} y1={plotBottom} y2={plotBottom} stroke={lightTheme.border} strokeWidth={1} />
                <SvgText x={4} y={BOX.paddingTop + 4} fontSize={11} fill={lightTheme.mutedForeground}>{String(data.scaleMax)}</SvgText>
                <SvgText x={4} y={plotBottom + 4} fontSize={11} fill={lightTheme.mutedForeground}>{String(data.scaleMin)}</SvgText>
                {points.length > 1 ? (
                  <Polyline
                    points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke={EVOLUTION_LINE_COLOR.light} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  />
                ) : null}
                {points.map((p, index) => (
                  <React.Fragment key={data.series[index].month}>
                    <Circle cx={p.x} cy={p.y} r={index === shown ? 7 : 5} fill={EVOLUTION_LINE_COLOR.light} stroke={lightTheme.card} strokeWidth={2} />
                    <SvgText x={p.x} y={HEIGHT - 8} fontSize={11} fill={lightTheme.mutedForeground} textAnchor="middle">{months[index]}</SvgText>
                  </React.Fragment>
                ))}
              </Svg>
            ) : null}
            {/* 44pt tap targets over the 10pt dots: there is no hover on a phone */}
            {points.map((p, index) => (
              <Pressable
                key={`hit-${data.series[index].month}`}
                onPress={() => setActive(index)}
                accessibilityRole="button"
                accessibilityLabel={t("players.evaluationHistory.pointCaption", { month: months[index], mean: formatMean(data.series[index].mean) })}
                testID={`evolution-point-${index}`}
                style={{ position: "absolute", left: p.x - 22, top: p.y - 22, width: 44, height: 44 }}
              />
            ))}
          </View>

          {shown !== null ? (
            <Text className="text-sm text-muted-foreground" testID={`evolution-point-caption-${shown}`}>
              {t("players.evaluationHistory.pointCaption", { month: months[shown], mean: formatMean(data.series[shown].mean) })}
            </Text>
          ) : null}

          {/* Q32: labelled by their WINDOW — rolling means over the ratings, beside calendar-month points. */}
          <Text className="text-xs font-medium text-muted-foreground" testID="evolution-means-heading">
            {t("players.evaluationHistory.meansHeading")}
          </Text>
          <View className="flex-row gap-2" testID="evolution-means">
            {([["m1", "meanLastMonth"], ["m6", "meanLast6Months"], ["m12", "meanLastYear"]] as const).map(([key, label]) => (
              <View key={key} className="flex-1 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">{t(`players.evaluationHistory.${label}`)}</Text>
                {/* the value rides on the testID (…-m6-3.7) so Maestro can assert what the server sent */}
                <Text className="text-xl font-semibold" testID={`evolution-mean-${key}-${formatMean(data.means[key])}`}>
                  {formatMean(data.means[key])}
                </Text>
              </View>
            ))}
          </View>

          {delta ? (
            <View className="flex-row items-center gap-1.5" testID={`evolution-delta-${delta.trend}`}>
              {/* Green is for up only, and never alone: the copy itself starts with "↑" / "↓" / "=" (the
                  canvas's strings). No icon beside it — the first simulator look showed two arrows in a row. */}
              <Text className={cn("text-sm font-medium", delta.trend === "up" ? "text-success" : "text-muted-foreground")}>
                {t(
                  delta.trend === "up"
                    ? "players.evaluationHistory.deltaUp"
                    : delta.trend === "down"
                      ? "players.evaluationHistory.deltaDown"
                      : "players.evaluationHistory.deltaFlat",
                  { value: delta.text, month: sinceLabel }
                )}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
