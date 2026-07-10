import { describe, it, expect } from "vitest";
import { formatWeekLabel } from "./useCalendar";

/**
 * Regression coverage for the week-range label formatting. The label used to
 * hardcode the Portuguese connector "de" into an English-formatted date
 * range (e.g. "6 - 12 de July 2026"). formatWeekLabel is the pure helper
 * extracted from the useCalendar hook so this can be tested without a React
 * renderer (the packages/* vitest config runs in a plain node environment).
 */
describe("formatWeekLabel", () => {
  it("formats an English same-month range with no hardcoded 'de'", () => {
    // Monday 2026-07-06 -> Sunday 2026-07-12
    const weekStart = new Date(2026, 6, 6);
    expect(formatWeekLabel(weekStart, "en")).toBe("6 - 12 July 2026");
  });

  it("defaults to English when no locale is passed", () => {
    const weekStart = new Date(2026, 6, 6);
    expect(formatWeekLabel(weekStart)).toBe("6 - 12 July 2026");
  });

  it("formats a Portuguese same-month range with the 'de' connector", () => {
    const weekStart = new Date(2026, 6, 6);
    expect(formatWeekLabel(weekStart, "pt")).toBe("6 - 12 de julho 2026");
  });

  it("formats an English cross-month range using abbreviated months", () => {
    // Monday 2026-06-29 -> Sunday 2026-07-05
    const weekStart = new Date(2026, 5, 29);
    expect(formatWeekLabel(weekStart, "en")).toBe("29 Jun - 5 Jul 2026");
  });

  it("formats a Portuguese cross-month range using abbreviated months", () => {
    const weekStart = new Date(2026, 5, 29);
    expect(formatWeekLabel(weekStart, "pt")).toBe("29 jun - 5 jul 2026");
  });
});
