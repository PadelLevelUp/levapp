import { describe, expect, it } from "vitest";

import {
  ALL_HISTORY_FROM,
  customPresencePeriod,
  presencePeriod,
  presencePeriodShortcuts,
} from "./presence-periods";

// Instants, written in UTC. Lisbon is UTC+1 in summer (WEST) and UTC+0 in winter (WET), so just
// after the club's midnight in summer the UTC date is still the day before.
const SUMMER_SUNDAY_2330 = new Date("2026-07-12T22:30:00Z"); // Sun 12 Jul, 23:30 Lisbon
const SUMMER_SUNDAY_0030 = new Date("2026-07-11T23:30:00Z"); // Sun 12 Jul, 00:30 Lisbon (UTC: Sat)
const WINTER_SUNDAY_2330 = new Date("2026-11-15T23:30:00Z"); // Sun 15 Nov, 23:30 Lisbon
const SUMMER_FIRST_0030 = new Date("2026-07-31T23:30:00Z"); // Sat 1 Aug, 00:30 Lisbon (UTC: 31 Jul)
const WINTER_FIRST_0030 = new Date("2027-01-01T00:30:00Z"); // Fri 1 Jan 2027, 00:30 Lisbon

describe("presencePeriod (PAD-837, attendance.validation rule 17g)", () => {
  it("[ATTENDANCE-VALIDATION-70] computes each shortcut on the club's day", () => {
    // The week starts on Sunday (calendar.view rule 5a): a Sunday is its week's first day.
    expect(presencePeriod("thisWeek", SUMMER_SUNDAY_2330)).toEqual({ from: "2026-07-12", to: "2026-07-18" });
    expect(presencePeriod("thisWeek", SUMMER_SUNDAY_0030)).toEqual({ from: "2026-07-12", to: "2026-07-18" });
    expect(presencePeriod("thisWeek", WINTER_SUNDAY_2330)).toEqual({ from: "2026-11-15", to: "2026-11-21" });

    // 00:30 on the 1st is already the new month at the club, whatever the UTC date says.
    expect(presencePeriod("thisMonth", SUMMER_FIRST_0030)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(presencePeriod("lastMonth", SUMMER_FIRST_0030)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(presencePeriod("thisWeek", SUMMER_FIRST_0030)).toEqual({ from: "2026-07-26", to: "2026-08-01" });
    expect(presencePeriod("thisMonth", WINTER_FIRST_0030)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(presencePeriod("lastMonth", WINTER_FIRST_0030)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    // A week across the year's end.
    expect(presencePeriod("thisWeek", WINTER_FIRST_0030)).toEqual({ from: "2026-12-27", to: "2027-01-02" });
    // February in a common year.
    expect(presencePeriod("lastMonth", new Date("2026-03-15T12:00:00Z"))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("[ATTENDANCE-VALIDATION-70] offers the season only with one, and takes its bounds as given", () => {
    const season = { startDate: "2026-09-01", endDate: "2027-07-31" };
    expect(presencePeriodShortcuts()).toEqual(["thisWeek", "thisMonth", "lastMonth", "all"]);
    expect(presencePeriodShortcuts(season)).toEqual(["thisWeek", "thisMonth", "lastMonth", "season", "all"]);
    expect(presencePeriod("season", WINTER_SUNDAY_2330, season)).toEqual({ from: "2026-09-01", to: "2027-07-31" });
    expect(presencePeriod("season", WINTER_SUNDAY_2330)).toBeNull();
  });

  it("[ATTENDANCE-VALIDATION-73] all history sends the constant from and the club's today, with no season", () => {
    expect(presencePeriod("all", WINTER_SUNDAY_2330)).toEqual({ from: ALL_HISTORY_FROM, to: "2026-11-15" });
    // 00:30 on the 1st is already the new day at the club, whatever the UTC date says.
    expect(presencePeriod("all", SUMMER_FIRST_0030)).toEqual({ from: ALL_HISTORY_FROM, to: "2026-08-01" });
    expect(presencePeriodShortcuts()).toContain("all");
  });

  it("[ATTENDANCE-VALIDATION-70] checks a custom range with isValidCustomRange", () => {
    expect(customPresencePeriod("2026-09-01", "2026-10-01")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(customPresencePeriod("2026-10-01", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(customPresencePeriod("2026-10-01", "2026-09-01")).toBeNull();
    expect(customPresencePeriod("", "2026-09-01")).toBeNull();
  });
});
