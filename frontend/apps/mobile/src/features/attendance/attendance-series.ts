import type { AttendanceBucket, AttendanceGranularity } from "@levelup/types";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";

import type { ChartPoint } from "@/components/charts/chart-geometry";

/**
 * PAD-162 — turns the endpoint's bucket series into chart points.
 *
 * The granularity is NOT re-derived here: the server picks it from the span and
 * echoes back the one it used (spec `attendance.history` rule 4), so this reads
 * the payload rather than duplicating the rule and drifting from it.
 *
 * `bucket.start` is a bare `YYYY-MM-DD` UTC period start. `parseISO` on a bare
 * date yields local midnight of that same calendar day, so formatting it prints
 * the day the server meant — the label never slides onto its neighbour the way
 * it would if the string were read as an instant and re-rendered in the
 * device's timezone.
 *
 * Two labels come out of each bucket: the short one the axis draws, and a long
 * unambiguous one for the chart's accessibility label. Web gets the long form
 * from a tooltip, which a phone chart has no room for.
 */
export function attendanceSeries(
  buckets: AttendanceBucket[],
  granularity: AttendanceGranularity,
  locale: Locale
): ChartPoint[] {
  return buckets.map((bucket) => {
    const date = parseISO(bucket.start);

    if (granularity === "day") {
      return {
        // A 7-bucket week reads better by weekday; a whole month by day number.
        label:
          buckets.length <= 7
            ? format(date, "EEE", { locale })
            : format(date, "d", { locale }),
        fullLabel: format(date, "d MMM yyyy", { locale }),
        value: bucket.count,
      };
    }

    if (granularity === "month") {
      return {
        label: format(date, "MMM", { locale }),
        fullLabel: format(date, "MMMM yyyy", { locale }),
        value: bucket.count,
      };
    }

    const year = format(date, "yyyy", { locale });
    return { label: year, fullLabel: year, value: bucket.count };
  });
}

/**
 * The chart's spoken summary: the series title, then every non-empty period.
 *
 * VoiceOver reads an SVG as one opaque image, so without this the chart is
 * simply not there for a screen-reader user. Empty periods are skipped — the
 * series is gap-filled, and reading "zero" thirty times buries the signal.
 */
export function attendanceChartLabel(
  points: ChartPoint[],
  seriesLabel: string,
  emptyLabel: string
): string {
  const filled = points.filter((p) => p.value > 0);
  if (filled.length === 0) return emptyLabel;
  return `${seriesLabel}. ${filled
    .map((p) => `${p.fullLabel ?? p.label}: ${p.value}`)
    .join(", ")}`;
}
