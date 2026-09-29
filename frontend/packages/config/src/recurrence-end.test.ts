import { describe, expect, it } from "vitest";
import { MAX_REQUEST_CLASSES, endDateAfterClasses } from "./recurrence-end";

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
