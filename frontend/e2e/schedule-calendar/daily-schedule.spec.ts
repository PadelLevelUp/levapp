import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// US-1: Coach sees weekly calendar with today's classes
test("US-1: weekly calendar renders with navigation controls", async ({ page }) => {
  // Week navigation buttons have aria-label="Previous week" / "Next week"
  const prevBtn = page.getByRole("button", { name: /previous week/i }).first();
  const nextBtn = page.getByRole("button", { name: /next week/i }).first();
  await expect(prevBtn.or(nextBtn)).toBeVisible({ timeout: 5000 });

  // Week label should be present (e.g. "10 – 16 March 2026")
  const weekLabel = page.locator("text=/january|february|march|april|may|june|july|august|september|october|november|december/i").first();
  await expect(weekLabel).toBeVisible({ timeout: 5000 });
});

// US-1: Seeded class appears on the calendar
test("US-1: seeded class appears on the calendar", async ({ page }) => {
  // Navigate forward until we find the seeded class title
  const title = "E2E Academy Class";
  let found = false;
  for (let i = 0; i < 4; i++) {
    const visible = await page.getByText(title).isVisible().catch(() => false);
    if (visible) {
      found = true;
      break;
    }
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(500);
  }
  expect(found).toBe(true);
});
