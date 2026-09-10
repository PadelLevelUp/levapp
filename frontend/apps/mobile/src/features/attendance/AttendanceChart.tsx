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
 *
 * PAD-221: `copyNamespace` picks whether the empty/loading/error strings come
 * from `attendance.chart` or `absences.chart` — the absences screen (PAD-163)
 * reuses this chart and used to read "no attendance recorded".
 */
export type AttendanceChartCopyNamespace = "attendance.chart" | "absences.chart";

export function AttendanceChart({
  buckets,
  granularity,
  loading,
  error,
  copyNamespace = "attendance.chart",
}: {
  buckets: AttendanceBucket[];
  granularity: AttendanceGranularity;
  loading?: boolean;
  error?: boolean;
  copyNamespace?: AttendanceChartCopyNamespace;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const points = React.useMemo(
    () => attendanceSeries(buckets, granularity, locale),
    [buckets, granularity, locale]
  );

  // Height via className, not `style`: Skeleton spreads its props AFTER its
  // own `style={animatedStyle}`, so a style prop here would replace the pulse
  // animation rather than add to it.
  if (loading) {
    return (
      <Skeleton
        testID="attendance-chart"
        className="h-[200px] w-full rounded-md"
        accessibilityLabel={t(`${copyNamespace}.loading`)}
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
          {t(`${copyNamespace}.error`)}
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
      emptyLabel={t(`${copyNamespace}.empty`)}
      accessibilityLabel={attendanceChartLabel(
        points,
        t(`${copyNamespace}.seriesLabel`),
        t(`${copyNamespace}.empty`)
      )}
    />
  );
}
