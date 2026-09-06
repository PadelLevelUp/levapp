import type { AttendanceBucket, AttendanceGranularity } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Chart } from "@/components/charts/Chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import {
  attendanceChartLabel,
  attendanceSeries,
} from "./attendance-series";

const CHART_HEIGHT = 200;

/**
 * PAD-162 — attendance counts per period, the iOS counterpart of web's
 * `components/attendance/AttendanceChart.tsx` (PAD-114).
 *
 * All this does is turn the payload into points and hand them to the shared
 * `Chart` primitive; the labelling rules live in `attendance-series.ts`, where
 * they are testable without a renderer. Loading and error are rendered at the
 * chart's own size so the card does not jump between states.
 */
export function AttendanceChart({
  buckets,
  granularity,
  loading,
  error,
}: {
  buckets: AttendanceBucket[];
  granularity: AttendanceGranularity;
  loading?: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const points = React.useMemo(
    () => attendanceSeries(buckets, granularity, locale),
    [buckets, granularity, locale]
  );

  if (loading) {
    return (
      <Skeleton
        testID="attendance-chart"
        className="w-full rounded-md"
        style={{ height: CHART_HEIGHT }}
        accessibilityLabel={t("attendance.chart.loading")}
      />
    );
  }

  if (error) {
    return (
      <View
        testID="attendance-chart"
        className="w-full items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <Text role="alert" className="text-sm text-destructive">
          {t("attendance.chart.error")}
        </Text>
      </View>
    );
  }

  return (
    <Chart
      testID="attendance-chart"
      data={points}
      variant="bar"
      height={CHART_HEIGHT}
      emptyLabel={t("attendance.chart.empty")}
      accessibilityLabel={attendanceChartLabel(
        points,
        t("attendance.chart.seriesLabel"),
        t("attendance.chart.empty")
      )}
    />
  );
}
