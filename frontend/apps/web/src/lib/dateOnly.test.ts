import { describe, expect, it } from "vitest";
import { addMonthsToIsoDate, weekdayOfIsoDate } from "./dateOnly";

// B-060: a bare "YYYY-MM-DD" is a calendar date. `new Date("2027-07-13")` is
// UTC midnight, which is Monday the 12th anywhere west of UTC.
describe("date-only strings are local calendar dates (B-060)", () => {
  it("the weekday of a bare date is that date's weekday", () => {
    expect(weekdayOfIsoDate("2027-07-13")).toBe(2); // Tuesday
    expect(weekdayOfIsoDate("2027-01-17")).toBe(0); // Sunday
  });

  it("adding months keeps the calendar date", () => {
    expect(addMonthsToIsoDate("2027-07-13", 1)).toBe("2027-08-13");
    expect(addMonthsToIsoDate("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsToIsoDate("2027-07-13", 3)).toBe("2027-10-13");
  });
});
