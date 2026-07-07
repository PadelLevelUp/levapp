import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// US-20: Coach can manage attendance / player roster in a class
test("US-20: coach can view and manage roster in class detail", async ({ page }) => {
  const title = "E2E Academy Class";
  const found = await findClassOnCalendar(page, title);
  expect(found).toBe(true);

  await page.getByText(title).first().click();

  // Roster / attendee section should show the seeded student (exact to avoid ambiguity)
  await expect(page.getByText("E2E Student", { exact: true }).first()).toBeVisible({ timeout: 5000 });
});
