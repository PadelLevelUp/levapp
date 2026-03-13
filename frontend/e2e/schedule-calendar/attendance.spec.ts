import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// US-20: Coach can manage attendance / player roster in a class
test("US-20: coach can view and manage roster in class detail", async ({ page }) => {
  const title = "E2E Academy Class";

  // Navigate to the week containing the seeded class
  for (let i = 0; i < 4; i++) {
    const visible = await page.getByText(title).isVisible().catch(() => false);
    if (visible) break;
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);
  }

  await page.getByText(title).first().click();

  // Roster / attendee section should show the seeded student
  await expect(page.getByText("E2E Student")).toBeVisible({ timeout: 5000 });
});
