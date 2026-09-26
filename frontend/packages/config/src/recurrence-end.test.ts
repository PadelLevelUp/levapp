import { describe, expect, it } from "vitest";
import {
  MAX_REQUEST_CLASSES,
  countPassesSeasonEnd,
  endDateAfterClasses,
  recurrenceEndPayload,
  seriesEndAfterClasses,
} from "./recurrence-end";

describe("endDateAfterClasses (classes.class-requests rule 14a, PAD-428)", () => {
  it("counts classes, not weeks: Tue+Thu from a Tuesday, 4 classes is two weeks", () => {
    // Tue 6, Thu 8, Tue 13, Thu 15
    expect(endDateAfterClasses("2026-10-06", [2, 4], 4)).toBe("2026-10-15");
  });

  it("a single weekday spreads the same count over more weeks", () => {
    expect(endDateAfterClasses("2026-10-06", [2], 4)).toBe("2026-10-27");
  });

  it("count 1 on a start that IS one of the weekdays is the start itself", () => {
    expect(endDateAfterClasses("2026-10-06", [2, 4], 1)).toBe("2026-10-06");
  });

  it("a start that is NOT one of the weekdays counts from the first occurrence after it", () => {
    // Monday 2026-10-05 with only Tuesday chosen: first occurrence is Tue 6.
    expect(endDateAfterClasses("2026-10-05", [2], 1)).toBe("2026-10-06");
  });

  it("crosses a month boundary", () => {
    // Fri 2026-10-30, weekly on Fridays: 30 Oct, 6 Nov -> 2 classes -> 6 Nov.
    expect(endDateAfterClasses("2026-10-30", [5], 2)).toBe("2026-11-06");
  });

  it("crosses a year boundary", () => {
    // Tue 2026-12-29, weekly on Tuesdays: 29 Dec, 5 Jan -> 2 classes -> 5 Jan 2027.
    expect(endDateAfterClasses("2026-12-29", [2], 2)).toBe("2027-01-05");
  });

  it("is null when no weekday is chosen", () => {
    expect(endDateAfterClasses("2026-10-06", [], 4)).toBeNull();
  });

  it("is null when count is 0", () => {
    expect(endDateAfterClasses("2026-10-06", [2], 0)).toBeNull();
  });

  it("exposes the input's ceiling", () => {
    expect(MAX_REQUEST_CLASSES).toBe(52);
  });
});

// classes.create rule 9 (PAD-463): the coach's series, whose days are the calendar's
// 0 = Sunday … 6 = Saturday, ends after N classes — exactly N.
describe("seriesEndAfterClasses (PAD-463)", () => {
  it("counts on the calendar's weekdays, Sunday included (criterion: Sun+Wed from Sun 4 Oct, 5 classes)", () => {
    // Sun 4, Wed 7, Sun 11, Wed 14, Sun 18
    expect(seriesEndAfterClasses("2026-10-04", [0, 3], 5)).toBe("2026-10-18");
  });

  it("Monday..Saturday need no mapping", () => {
    expect(seriesEndAfterClasses("2026-10-05", [1], 3)).toBe("2026-10-19");
  });

  it("nothing to count gives null", () => {
    expect(seriesEndAfterClasses("2026-10-04", [], 5)).toBeNull();
    expect(seriesEndAfterClasses("2026-10-04", [0], 0)).toBeNull();
  });
});

describe("countPassesSeasonEnd (PAD-463)", () => {
  const season = { startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };

  it("names the season's end when the Nth class falls after it (criterion: Mondays from 5 Jul 2027, 6 classes)", () => {
    const last = seriesEndAfterClasses("2027-07-05", [1], 6);
    expect(last).toBe("2027-08-09");
    expect(countPassesSeasonEnd("2027-07-05", last, season)).toBe("2027-07-31");
  });

  it("is null inside the season, with no season, or in a gap", () => {
    expect(countPassesSeasonEnd("2026-10-05", "2026-11-30", season)).toBeNull();
    expect(countPassesSeasonEnd("2027-07-05", "2027-08-09", null)).toBeNull();
    expect(countPassesSeasonEnd("2027-08-10", "2027-08-30", season)).toBeNull();
  });
});

describe("recurrenceEndPayload (PAD-463, classes.create rule 9)", () => {
  const base = { startDate: "2026-10-04", calendarDays: [0, 3], endDate: "", count: null as number | null };

  it("an end date is sent as is", () => {
    expect(recurrenceEndPayload({ ...base, mode: "date", endDate: "2026-12-20" })).toEqual({
      ok: true, endDate: "2026-12-20", recursUntilSeasonEnd: false,
    });
  });

  it("a date mode without a date is an endDate error", () => {
    expect(recurrenceEndPayload({ ...base, mode: "date" })).toEqual({ ok: false, field: "endDate" });
  });

  it("N classes become the date of the Nth class", () => {
    expect(recurrenceEndPayload({ ...base, mode: "count", count: 5 })).toEqual({
      ok: true, endDate: "2026-10-18", recursUntilSeasonEnd: false,
    });
  });

  it("a count outside 1..52, or no weekday to count on, is a count error", () => {
    for (const count of [null, 0, 53, 2.5]) {
      expect(recurrenceEndPayload({ ...base, mode: "count", count })).toEqual({ ok: false, field: "count" });
    }
    expect(recurrenceEndPayload({ ...base, mode: "count", count: 5, calendarDays: [] })).toEqual({ ok: false, field: "count" });
  });

  it("the season sends the flag and no date", () => {
    expect(recurrenceEndPayload({ ...base, mode: "season", endDate: "2026-12-20" })).toEqual({
      ok: true, endDate: null, recursUntilSeasonEnd: true,
    });
  });
});
