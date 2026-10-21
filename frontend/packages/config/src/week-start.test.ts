import { describe, expect, it } from "vitest";
import { WEEKDAYS_FROM_WEEK_START, WEEK_STARTS_ON, daysSinceWeekStart } from "./week-start";

// calendar.view rule 5a (PAD-682): weeks start on Sunday.
describe("week start", () => {
  it("is Sunday", () => {
    expect(WEEK_STARTS_ON).toBe(0);
  });

  it("counts days since the week start (Wed 2026-10-21 is 3 after Sun 2026-10-18)", () => {
    const wednesday = new Date(Date.UTC(2026, 9, 21)).getUTCDay();
    expect(daysSinceWeekStart(wednesday)).toBe(3);
    expect(daysSinceWeekStart(0)).toBe(0);
    expect(daysSinceWeekStart(6)).toBe(6);
  });

  it("lists getDay() values Sunday first, values unchanged", () => {
    expect(WEEKDAYS_FROM_WEEK_START).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
