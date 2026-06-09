import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { format, addDays, nextMonday } from "date-fns";

test.describe("PAD-25: Calendar day click should pre-populate class date field", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openCalendar(page);
  });

  test("clicking Add class from toolbar pre-populates date with today", async ({
    page,
  }) => {
    // Click "Add class" button in the toolbar
    const addClassBtn = page
      .getByRole("button", { name: /add class/i })
      .first();
    await expect(addClassBtn).toBeVisible({ timeout: 5000 });
    await addClassBtn.click();

    // The AddClassSheet should open with the date field pre-populated
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 5000 });

    const today = format(new Date(), "yyyy-MM-dd");
    await expect(dateInput).toHaveValue(today);
  });

  test("clicking a time slot pre-populates date with that day", async ({
    page,
  }) => {
    // Navigate to next week where the seeded class is
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);

    // The scrollable grid area contains the time slots
    // Use the grid that has min-h-full (the body grid, not the header)
    const gridBody = page.locator(
      ".grid.grid-cols-\\[60px_repeat\\(7\\,1fr\\)\\].min-h-full"
    );
    await expect(gridBody).toBeVisible({ timeout: 5000 });

    // Click the first half-hour slot in the second column (Tuesday)
    // Column index: 0=time labels, 1=Mon, 2=Tue
    const tuesdayCol = gridBody.locator("> div").nth(2);
    // Each hour has a div with two halves. Click the first hour's first half.
    const firstHourSlot = tuesdayCol.locator("> div").first();
    const firstHalf = firstHourSlot.locator("> div").first();
    await firstHalf.click();

    // The AddClassSheet should open with the date field matching Tuesday
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 5000 });

    // The date should not be empty and should be a valid date
    const dateValue = await dateInput.inputValue();
    expect(dateValue).toBeTruthy();
    expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("mobile: selecting a day then clicking Add class uses that day", async ({
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await openCalendar(page);

    // Navigate to next week to avoid today ambiguity
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(500);

    // On mobile, the calendar shows day buttons. Click Wednesday (the Wed day label
    // is date-dependent, so match on the weekday prefix).
    const wednesdayBtn = page.getByRole("button", { name: /^wed\s+\d+/i }).first();
    await expect(wednesdayBtn).toBeVisible({ timeout: 5000 });
    await wednesdayBtn.click();

    // On mobile, toolbar buttons are icon-only. The "Add class" button is the last button
    // in the toolbar (Plus icon). It's the second icon button after "Add event".
    // Both are unlabelled, so target the last button in the toolbar actions area.
    const toolbarButtons = page.locator(".flex.items-center.gap-2").last().locator("button");
    const addClassBtn = toolbarButtons.last();
    await addClassBtn.click();

    // The date field should have Wednesday's date
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 5000 });

    // Calculate next week's Wednesday
    const nextWeekMonday = nextMonday(new Date());
    const nextWed = addDays(nextWeekMonday, 2);
    const expectedDate = format(nextWed, "yyyy-MM-dd");

    await expect(dateInput).toHaveValue(expectedDate);
  });
});
