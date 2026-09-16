import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttendanceBucket, AttendanceGranularity } from "@/types";
import { parseIsoDate } from "./dateRanges";

/**
 * PAD-114 — attendance counts per period.
 *
 * Form: one measure (a count) over ordered time periods → bars. A single series
 * means no legend (the card title names it) and no colour encoding to decode;
 * identity is carried by the axis, magnitude by bar height. The fill is the
 * app's `--primary` token so light and dark are both handled by the theme
 * rather than by a hardcoded hex.
 *
 * The series is gap-filled server-side, so empty periods render as zero-height
 * bars and the axis stays continuous instead of skipping quiet weeks.
 *
 * PAD-221: the absences page (PAD-141) reuses this chart unchanged, so its
 * empty/loading/error copy used to read "no attendance recorded" on a page
 * about absences. `copyNamespace` picks the locale block the strings come
 * from; the two blocks carry the same four keys.
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
  const { t, i18n } = useTranslation();

  const chartConfig = {
    count: {
      label: t(`${copyNamespace}.seriesLabel`),
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  const data = useMemo(() => {
    // Formatters are pinned to UTC: the bucket keys are UTC period starts, and
    // rendering them in the viewer's timezone would shift labels by a day.
    const dayFmt = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      timeZone: "UTC",
    });
    const weekdayFmt = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      timeZone: "UTC",
    });
    const monthFmt = new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      timeZone: "UTC",
    });
    const fullFmt = new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: "UTC",
    });

    return buckets.map((bucket) => {
      const date = parseIsoDate(bucket.start);
      let label: string;
      let full: string;
      if (granularity === "day") {
        // A 7-bucket week reads better by weekday; a whole month by day number.
        label =
          buckets.length <= 7 ? weekdayFmt.format(date) : dayFmt.format(date);
        full = fullFmt.format(date);
      } else if (granularity === "month") {
        label = monthFmt.format(date);
        full = `${monthFmt.format(date)} ${date.getUTCFullYear()}`;
      } else {
        label = String(date.getUTCFullYear());
        full = label;
      }
      return { label, full, count: bucket.count };
    });
  }, [buckets, granularity, i18n.language]);

  const isEmpty = data.every((d) => d.count === 0);
  // Keep the y-axis on whole classes — a "1.5 attended" tick is meaningless.
  const maxCount = data.reduce((max, d) => Math.max(max, d.count), 0);
  const yMax = Math.max(4, maxCount + 1);

  if (loading) {
    return (
      <div
        data-testid="attendance-chart"
        data-state="loading"
        className="h-[220px] w-full"
        aria-busy="true"
        aria-label={t(`${copyNamespace}.loading`)}
      >
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="attendance-chart"
        data-state="error"
        role="alert"
        className="flex h-[220px] w-full items-center justify-center text-sm text-destructive"
      >
        {t(`${copyNamespace}.error`)}
      </div>
    );
  }

  return (
    <div
      data-testid="attendance-chart"
      data-state={isEmpty ? "empty" : "ready"}
      className="relative h-[220px] w-full"
    >
      <ChartContainer config={chartConfig} className="h-full w-full aspect-auto">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/* Recessive grid: horizontal only, so bars read against value lines
              without a cage around them. */}
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, yMax]}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                // The bar's own `full` label (e.g. "1 Aug 2026") rather than
                // the abbreviated axis tick, so a hovered bar is unambiguous.
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.full ?? ""
                }
              />
            }
          />
          {/* 4px rounded data-end anchored to the baseline; maxBarSize keeps the
              marks thin when a week only has 7 of them.

              `isAnimationActive={false}` is load-bearing, not a style choice.
              Recharts grows each bar from zero height via requestAnimationFrame,
              and a `Rectangle` of zero height renders nothing at all — so
              whenever rAF is throttled (a background tab, a headless renderer,
              reduced-motion) the animation never advances and every bar stays an
              EMPTY <g>: axes, grid and tooltips all present, no marks. The chart
              silently reads as "no attendance". Drawing the bars synchronously
              removes that failure mode entirely, and a count-per-period chart
              gains nothing from the grow-in. */}
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>

      {isEmpty ? (
        <p
          data-testid="attendance-chart-empty"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        >
          {t(`${copyNamespace}.empty`)}
        </p>
      ) : null}
    </div>
  );
}
