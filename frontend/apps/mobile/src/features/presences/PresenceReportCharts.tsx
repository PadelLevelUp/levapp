import type {
  AttendanceBucket,
  AttendanceGranularity,
  PresencePlayerStats,
  PresenceStatsTotals,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Chart, type ChartPoint } from "@/components/charts/Chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import {
  attendanceChartLabel,
  attendanceSeries,
} from "@/features/attendance/attendance-series";
import { splitPoints, topPlayerPoints } from "./report-state";

const CHART_HEIGHT = 180;

/**
 * PAD-166 — web's three Presences charts, on iOS.
 *
 * Web (`components/presences/PresenceCharts.tsx`) draws them side by side with
 * Recharts. There is no Recharts on React Native, so all three go through the
 * app's own `react-native-svg` primitive (`components/charts/Chart`, PAD-162),
 * which its own note already named PAD-166 as a consumer. They stack instead of
 * sitting in a row, because three charts across 390pt is three unreadable
 * charts.
 *
 * Two adaptations, both forced by the primitive being single-series by design:
 *
 *   * the academy/private **donut becomes two bars**. Same measure, same two
 *     figures, no legend to decode and no colour to map — on a phone that reads
 *     better than a 100pt donut, and it avoids growing the shared primitive a
 *     second encoding it explicitly does not want.
 *   * there are **no tooltips**, so each chart carries a spoken summary
 *     instead (`attendanceChartLabel`). VoiceOver reads an SVG as one opaque
 *     image; without the summary the charts would simply not exist for a
 *     screen-reader user, which on web the tooltip covers.
 *
 * The over-time series reuses PAD-162's `attendanceSeries` rather than
 * re-deriving labels: both charts plot the same `AttendanceBucket[]` shape from
 * the same server-chosen granularity, and a second copy of the labelling rules
 * is a second thing to drift.
 */
export function PresenceReportCharts({
  players,
  totals,
  trend,
  granularity,
  loading,
  trendError,
  scope,
}: {
  players: PresencePlayerStats[];
  totals?: PresenceStatsTotals;
  trend: AttendanceBucket[];
  granularity: AttendanceGranularity;
  loading?: boolean;
  /**
   * The trend series has its own endpoint, so it can fail while the roster
   * stats load fine. Distinguished from an empty series on purpose: drawing
   * "no attendance recorded yet" over a failed request tells the coach
   * something false about their week.
   */
  trendError?: boolean;
  /** PAD-192: set while the filter sheet narrows the roster; the caption says so. */
  scope?: { shown: number; total: number } | null;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const perPlayer = React.useMemo(() => topPlayerPoints(players), [players]);

  const split = React.useMemo(
    () =>
      splitPoints(totals, {
        private: t("presences.type.private"),
        academy: t("presences.type.academy"),
      }),
    [totals, t]
  );

  const overTime = React.useMemo(
    () => attendanceSeries(trend, granularity, locale),
    [trend, granularity, locale]
  );

  if (loading) {
    return (
      <View className="gap-3" testID="presences-charts-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[248px] w-full rounded-xl" />
        ))}
      </View>
    );
  }

  return (
    <View className="gap-3" testID="presences-charts">
      {scope ? (
        <Text className="text-xs font-sans-semibold text-muted-foreground" testID="presences-charts-scope">
          {t("presences.charts.following", { shown: scope.shown, total: scope.total })}
        </Text>
      ) : null}
      <ChartCard
        title={t("presences.charts.perPlayer")}
        subtitle={t("presences.charts.perPlayerHint")}
        points={perPlayer}
        variant="bar"
        testID="presences-chart-per-player"
        // Eight abbreviated names is the most a phone axis carries; the
        // primitive thins labels above `maxLabels`, which for this chart would
        // silently drop players from a ranking that is the whole point.
        maxLabels={8}
      />
      <ChartCard
        title={t("presences.charts.split")}
        subtitle={t("presences.charts.splitHint")}
        points={split}
        variant="bar"
        testID="presences-chart-split"
        maxLabels={2}
      />
      <ChartCard
        title={t("presences.charts.overTime")}
        subtitle={t("presences.charts.overTimeHint")}
        points={overTime}
        variant="line"
        testID="presences-chart-over-time"
        error={trendError}
      />
    </View>
  );
}

function ChartCard({
  title,
  subtitle,
  points,
  variant,
  testID,
  maxLabels,
  error,
}: {
  title: string;
  subtitle: string;
  points: ChartPoint[];
  variant: "bar" | "line";
  testID: string;
  maxLabels?: number;
  error?: boolean;
}) {
  const { t } = useTranslation();
  const empty = t("presences.charts.empty");

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-sans-bold">{title}</Text>
      <Text className="mb-3 text-xs text-muted-foreground">{subtitle}</Text>
      {error ? (
        <View
          testID={testID}
          className="w-full items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <Text role="alert" className="text-sm text-destructive">
            {t("presences.error.statsBody")}
          </Text>
        </View>
      ) : points.length === 0 ? (
        // An empty series has no bars to overlay a message on, so the card
        // states it rather than rendering a blank 180pt hole.
        <View
          testID={testID}
          className="w-full items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <Text className="text-sm text-muted-foreground">{empty}</Text>
        </View>
      ) : (
        <Chart
          testID={testID}
          data={points}
          variant={variant}
          height={CHART_HEIGHT}
          emptyLabel={empty}
          maxLabels={maxLabels}
          accessibilityLabel={attendanceChartLabel(points, title, empty)}
        />
      )}
    </View>
  );
}
