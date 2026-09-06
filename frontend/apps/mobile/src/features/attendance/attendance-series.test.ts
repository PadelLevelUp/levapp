import type { AttendanceBucket } from "@levelup/types";
import { enUS, pt } from "date-fns/locale";
import { describe, expect, it } from "vitest";

import { attendanceChartLabel, attendanceSeries } from "./attendance-series";

const bucket = (start: string, count: number): AttendanceBucket => ({
  start,
  count,
});

describe("attendanceSeries", () => {
  it("labels a 7-bucket week by weekday", () => {
    const week = [
      bucket("2026-09-14", 1),
      bucket("2026-09-15", 0),
      bucket("2026-09-16", 2),
      bucket("2026-09-17", 0),
      bucket("2026-09-18", 0),
      bucket("2026-09-19", 1),
      bucket("2026-09-20", 0),
    ];
    expect(attendanceSeries(week, "day", enUS).map((p) => p.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("labels a month of days by day number", () => {
    const month = Array.from({ length: 30 }, (_, i) =>
      bucket(`2026-09-${String(i + 1).padStart(2, "0")}`, 0)
    );
    const points = attendanceSeries(month, "day", enUS);
    expect(points).toHaveLength(30);
    expect(points[0].label).toBe("1");
    expect(points[29].label).toBe("30");
  });

  it("labels months and years from the granularity the server echoed", () => {
    expect(
      attendanceSeries([bucket("2026-03-01", 4)], "month", enUS)[0]
    ).toMatchObject({ label: "Mar", fullLabel: "March 2026", value: 4 });

    expect(
      attendanceSeries([bucket("2026-01-01", 9)], "year", enUS)[0]
    ).toMatchObject({ label: "2026", fullLabel: "2026", value: 9 });
  });

  it("follows the active language (PAD-157: every format() takes a locale)", () => {
    const [ptPoint] = attendanceSeries([bucket("2026-03-01", 1)], "month", pt);
    expect(ptPoint.label).toBe("mar");
    expect(ptPoint.fullLabel).toBe("março 2026");
  });

  it("keeps a bucket on its own calendar day", () => {
    // The drift this guards: reading the bare UTC date as an instant and
    // re-rendering it in a negative-offset timezone shows the day before.
    const [point] = attendanceSeries([bucket("2026-03-01", 1)], "day", enUS);
    expect(point.fullLabel).toBe("1 Mar 2026");
  });

  it("carries the count through untouched, zeros included", () => {
    const points = attendanceSeries(
      [bucket("2026-09-14", 0), bucket("2026-09-15", 3)],
      "day",
      enUS
    );
    expect(points.map((p) => p.value)).toEqual([0, 3]);
  });

  it("maps an empty payload to an empty series", () => {
    expect(attendanceSeries([], "day", enUS)).toEqual([]);
  });
});

describe("attendanceChartLabel", () => {
  const points = attendanceSeries(
    [
      bucket("2026-09-14", 2),
      bucket("2026-09-15", 0),
      bucket("2026-09-16", 1),
    ],
    "day",
    enUS
  );

  it("names the series and every period that has data", () => {
    expect(attendanceChartLabel(points, "Attended", "No attendance")).toBe(
      "Attended. 14 Sep 2026: 2, 16 Sep 2026: 1"
    );
  });

  it("omits empty periods rather than burying the signal in zeros", () => {
    expect(
      attendanceChartLabel(points, "Attended", "No attendance")
    ).not.toContain("15 Sep");
  });

  it("falls back to the empty copy when nothing was attended", () => {
    const empty = attendanceSeries([bucket("2026-09-14", 0)], "day", enUS);
    expect(attendanceChartLabel(empty, "Attended", "No attendance")).toBe(
      "No attendance"
    );
  });
});
