import { describe, expect, it } from "vitest";
import { findSeasonCoveringDate } from "./season-coverage";

const AUTUMN = { id: 1, name: "Autumn 2026", startDate: "2026-08-08", endDate: "2026-11-08" };
const WINTER = { id: 2, name: "Winter 2026", startDate: "2026-11-09", endDate: "2027-02-28" };

describe("findSeasonCoveringDate", () => {
  it("finds the season whose range contains the date", () => {
    expect(findSeasonCoveringDate("2026-09-06", [AUTUMN, WINTER])).toBe(AUTUMN);
    expect(findSeasonCoveringDate("2026-12-24", [AUTUMN, WINTER])).toBe(WINTER);
  });

  it("treats both ends of the range as inclusive", () => {
    // calendar.seasons rule 1's overlap test is inclusive, so coverage is too.
    expect(findSeasonCoveringDate("2026-08-08", [AUTUMN])).toBe(AUTUMN);
    expect(findSeasonCoveringDate("2026-11-08", [AUTUMN])).toBe(AUTUMN);
  });

  it("returns null for a date in the gap between two seasons", () => {
    const spring = { startDate: "2026-03-01", endDate: "2026-05-31" };
    const summer = { startDate: "2026-07-01", endDate: "2026-08-31" };
    expect(findSeasonCoveringDate("2026-06-15", [spring, summer])).toBeNull();
  });

  it("returns null when the coach has no seasons at all", () => {
    expect(findSeasonCoveringDate("2026-09-06", [])).toBeNull();
    expect(findSeasonCoveringDate("2026-09-06", undefined)).toBeNull();
    expect(findSeasonCoveringDate("2026-09-06", null)).toBeNull();
  });

  it("reads a full ISO timestamp by its day key", () => {
    expect(findSeasonCoveringDate("2026-09-06T18:30:00", [AUTUMN])).toBe(AUTUMN);
  });

  it("returns null for a missing or half-typed date rather than guessing", () => {
    expect(findSeasonCoveringDate("", [AUTUMN])).toBeNull();
    expect(findSeasonCoveringDate(undefined, [AUTUMN])).toBeNull();
    expect(findSeasonCoveringDate("2026-09", [AUTUMN])).toBeNull();
  });

  it("skips a season row with a missing bound instead of matching it", () => {
    const broken = { startDate: "", endDate: "2026-11-08" };
    expect(findSeasonCoveringDate("2026-09-06", [broken])).toBeNull();
    expect(findSeasonCoveringDate("2026-09-06", [broken, AUTUMN])).toBe(AUTUMN);
  });

  it("crosses a year boundary", () => {
    expect(findSeasonCoveringDate("2027-01-15", [WINTER])).toBe(WINTER);
    expect(findSeasonCoveringDate("2027-03-01", [WINTER])).toBeNull();
  });
});
