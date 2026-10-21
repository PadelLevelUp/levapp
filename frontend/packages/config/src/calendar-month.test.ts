import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { enUS, pt } from "date-fns/locale";
import { buildMonthGrid, formatMonthLabel, isInMonth } from "./calendar-month";

/**
 * calendar.mobile-views rules 15–16 (PAD-248): the Mês grid is every day of
 * every Sunday-start week (WEEK_STARTS_ON, PAD-682) that touches the month, and the month label follows
 * the active language. Shared so web and iOS draw the same grid.
 *
 * Criteria: "Month grid dims other months and marks days",
 *           "Month paging refetches and reselects", "Labels follow the language".
 */
const key = (d: Date) => format(d, "yyyy-MM-dd");

describe("buildMonthGrid", () => {
  it("September 2026 (starts on a Tuesday) runs Sun 30 Aug – Sat 3 Oct, five weeks", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 17));
    expect(key(grid.monthStart)).toBe("2026-09-01");
    expect(grid.days).toHaveLength(35);
    expect(key(grid.days[0])).toBe("2026-08-30");
    expect(key(grid.days[34])).toBe("2026-10-03");
    expect(key(grid.start)).toBe("2026-08-30");
    expect(key(grid.end)).toBe("2026-10-03");
  });

  it("August 2026 (starts on a Saturday) needs six weeks", () => {
    const grid = buildMonthGrid(new Date(2026, 7, 1));
    expect(grid.days).toHaveLength(42);
    expect(key(grid.days[0])).toBe("2026-07-26");
    expect(key(grid.days[41])).toBe("2026-09-05");
  });

  it("February 2026 (Sunday 1st, 28 days) is exactly four weeks with no other-month days", () => {
    const grid = buildMonthGrid(new Date(2026, 1, 10));
    expect(grid.days).toHaveLength(28);
    expect(grid.days.every((d) => isInMonth(d, grid.monthStart))).toBe(true);
  });

  it("every row is a Sunday-to-Saturday week", () => {
    const grid = buildMonthGrid(new Date(2026, 9, 1));
    for (let i = 0; i < grid.days.length; i += 7) {
      expect(format(grid.days[i], "EEEE", { locale: enUS })).toBe("Sunday");
    }
  });

  it("October 2026 (PAD-682 criterion) opens on Sunday 27 September", () => {
    const grid = buildMonthGrid(new Date(2026, 9, 21));
    expect(key(grid.days[0])).toBe("2026-09-27");
    expect(key(grid.days[grid.days.length - 1])).toBe("2026-10-31");
  });
});

describe("isInMonth", () => {
  it("separates the month's own days from the leading and trailing ones", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 1));
    expect(isInMonth(new Date(2026, 7, 30), grid.monthStart)).toBe(false);
    expect(isInMonth(new Date(2026, 8, 1), grid.monthStart)).toBe(true);
    expect(isInMonth(new Date(2026, 8, 30), grid.monthStart)).toBe(true);
    expect(isInMonth(new Date(2026, 9, 1), grid.monthStart)).toBe(false);
  });
});

describe("formatMonthLabel", () => {
  it("reads 'Setembro 2026' in Portuguese — capitalised, as the design shows", () => {
    expect(formatMonthLabel(new Date(2026, 8, 10), pt)).toBe("Setembro 2026");
  });

  it("reads 'September 2026' in English", () => {
    expect(formatMonthLabel(new Date(2026, 8, 10), enUS)).toBe("September 2026");
  });
});
