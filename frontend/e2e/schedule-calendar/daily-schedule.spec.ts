import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// US-1: Coach sees weekly calendar with today's classes
test("US-1: weekly calendar renders with navigation controls", async ({ page }) => {
  // Week navigation buttons have aria-label="Previous week" / "Next week"
  const nextBtn = page.getByRole("button", { name: /next week/i }).first();
  await expect(nextBtn).toBeVisible({ timeout: 5000 });

  // Week label should be present (e.g. "29 Jun - 5 Jul 2026"). The UI renders
  // abbreviated month names, so match the 3-letter prefixes (also matches full names).
  const weekLabel = page.locator("text=/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i").first();
  await expect(weekLabel).toBeVisible({ timeout: 5000 });
});

// US-1: Seeded class appears on the calendar
test("US-1: seeded class appears on the calendar", async ({ page }) => {
  const found = await findClassOnCalendar(page, "E2E Academy Class");
  expect(found).toBe(true);
});
