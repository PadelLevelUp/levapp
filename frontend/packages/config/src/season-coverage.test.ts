import { describe, expect, it } from "vitest";
import {
  clampDay,
  nextSeasonOccurrence,
  seasonOccurrenceContaining,
  seasonOccurrenceLabel,
  seasonWrapsYear,
} from "./season-coverage";

/**
 * calendar.seasons rules 3–4 (PAD-82). The same cases pin the Python twin in
 * backend/padel_app/tests/test_season_definition.py; keep them in step.
 */
const SEP_JUL = { startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };
const FEB_JUN = { startDay: 1, startMonth: 2, endDay: 30, endMonth: 6 };

describe("seasonOccurrenceContaining", () => {
  it("wraps the year: 1 Sep → 31 Jul", () => {
    expect(seasonWrapsYear(SEP_JUL)).toBe(true);
    expect(seasonOccurrenceContaining("2026-10-15", SEP_JUL)).toEqual({ startDate: "2026-09-01", endDate: "2027-07-31" });
    expect(seasonOccurrenceContaining("2027-03-01", SEP_JUL)).toEqual({ startDate: "2026-09-01", endDate: "2027-07-31" });
    expect(seasonOccurrenceContaining("2026-08-10", SEP_JUL)).toBeNull(); // the gap
  });

  it("treats both bounds as inclusive", () => {
    expect(seasonOccurrenceContaining("2026-09-01", SEP_JUL)?.startDate).toBe("2026-09-01");
    expect(seasonOccurrenceContaining("2027-07-31", SEP_JUL)?.endDate).toBe("2027-07-31");
  });

  it("does not wrap: 1 Feb → 30 Jun", () => {
    expect(seasonWrapsYear(FEB_JUN)).toBe(false);
    expect(seasonOccurrenceContaining("2026-04-01", FEB_JUN)).toEqual({ startDate: "2026-02-01", endDate: "2026-06-30" });
    expect(seasonOccurrenceContaining("2026-07-01", FEB_JUN)).toBeNull();
  });

  it("clamps 29 February in a non-leap year", () => {
    expect(clampDay(2027, 2, 29)).toBe("2027-02-28");
    expect(clampDay(2028, 2, 29)).toBe("2028-02-29");
    expect(seasonOccurrenceContaining("2027-01-10", { startDay: 1, startMonth: 9, endDay: 29, endMonth: 2 })).toEqual({
      startDate: "2026-09-01",
      endDate: "2027-02-28",
    });
  });

  it("reads a full ISO timestamp by its day key and rejects a half-typed date", () => {
    expect(seasonOccurrenceContaining("2026-10-15T10:00:00", SEP_JUL)?.startDate).toBe("2026-09-01");
    expect(seasonOccurrenceContaining("2026-1", SEP_JUL)).toBeNull();
    expect(seasonOccurrenceContaining(null, SEP_JUL)).toBeNull();
    expect(seasonOccurrenceContaining("2026-10-15", null)).toBeNull();
  });
});

describe("nextSeasonOccurrence", () => {
  it("is the first occurrence starting after the date", () => {
    expect(nextSeasonOccurrence("2026-08-10", SEP_JUL)).toEqual({ startDate: "2026-09-01", endDate: "2027-07-31" });
    expect(nextSeasonOccurrence("2026-10-15", SEP_JUL)).toEqual({ startDate: "2027-09-01", endDate: "2028-07-31" });
    expect(nextSeasonOccurrence("2026-07-01", FEB_JUN)).toEqual({ startDate: "2027-02-01", endDate: "2027-06-30" });
  });
});

describe("seasonOccurrenceLabel", () => {
  it("uses the coach's label, else the year span", () => {
    expect(seasonOccurrenceLabel({ startDate: "2026-09-01", endDate: "2027-07-31" })).toBe("2026/2027");
    expect(seasonOccurrenceLabel({ startDate: "2026-02-01", endDate: "2026-06-30" })).toBe("2026");
    expect(seasonOccurrenceLabel({ startDate: "2026-09-01", endDate: "2027-07-31" }, "Época")).toBe("Época");
  });
});
