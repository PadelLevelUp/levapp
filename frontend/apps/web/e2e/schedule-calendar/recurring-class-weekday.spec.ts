import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

/**
 * PAD-59: the seeded "E2E Recurring Class" must materialize on TUESDAY.
 *
 * The seed (e2e/scripts/seed.py) builds the recurring lesson's start on the
 * next Tuesday, but stored `daysOfWeek` using Python's `date.weekday()`
 * (Mon=0, Tue=1). The app's canonical weekday convention is JS `getDay()`
 * (Sun=0, Mon=1, Tue=2) — see packages/types/src/domain.ts and the backend
 * WEEKDAY_MAP — so the seeded `1` was read as MONDAY and the class
 * materialized a day early.
 *
 * With the buggy seed value this test FAILS (class shows in the Monday column);
 * after the fix (`daysOfWeek: [2]`) it PASSES (class shows in the Tuesday
 * column).
 *
 * The desktop CalendarGrid renders a `grid-cols-[60px_repeat(7,1fr)]` grid:
 * child 0 is the time gutter, then one column per week day. useCalendar uses
 * `weekStartsOn: 1` (Monday), so column index 1 = Monday and 2 = Tuesday. The
 * CalendarHeader row (same column layout, no `min-h-full`) labels each column
 * with its weekday abbreviation, which we assert to prove column 2 really is
 * Tuesday.
 */

const RECURRING_CLASS = "E2E Recurring Class";
// Both header and body use this column template; body additionally has min-h-full.
const GRID_COLS = ".grid.grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\]";

test.describe("PAD-59: recurring class materializes on the correct weekday", () => {
  test.beforeEach(async ({ page }) => {
    // Desktop viewport so CalendarPage renders CalendarHeader + CalendarGrid
    // (day-addressable columns) rather than the mobile single-day view.
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsCoach(page);
    await openCalendar(page);
  });

  test("PAD-59: 'E2E Recurring Class' appears under a Tuesday column, not Monday", async ({
    page,
  }) => {
    // Advance week-by-week until the recurring class's first occurrence shows.
    const found = await findClassOnCalendar(page, RECURRING_CLASS, 4);
    expect(
      found,
      `Expected to find "${RECURRING_CLASS}" on the calendar within 4 weeks`
    ).toBe(true);

    // Header column layout (first grid = header; body grid has min-h-full).
    const headerCols = page.locator(`${GRID_COLS}:not(.min-h-full) > div`);
    const bodyCols = page.locator(`${GRID_COLS}.min-h-full > div`);

    // Column indices (child 0 = time gutter): 1 = Monday, 2 = Tuesday.
    const mondayHeader = headerCols.nth(1);
    const tuesdayHeader = headerCols.nth(2);
    const mondayCol = bodyCols.nth(1);
    const tuesdayCol = bodyCols.nth(2);

    // Sanity-check the column mapping via the weekday labels (coach locale = en,
    // so the header abbreviations are Mon/Tue/...). This guarantees column 2 is
    // genuinely Tuesday rather than trusting the index blindly.
    await expect(mondayHeader).toContainText(/mon/i);
    await expect(tuesdayHeader).toContainText(/tue/i);

    // The key assertion: the recurring class sits under Tuesday, not Monday.
    await expect(
      tuesdayCol.getByText(RECURRING_CLASS),
      "recurring class should render in the Tuesday column"
    ).toBeVisible();
    await expect(
      mondayCol.getByText(RECURRING_CLASS),
      "recurring class must NOT render in the Monday column (the PAD-59 bug)"
    ).toHaveCount(0);
  });
});
