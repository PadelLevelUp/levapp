/**
 * PAD-520 (dashboard.navigation rule 12; B-345): the coach dashboard's "Nova aula" opens the
 * new-class sheet, not just the calendar. Before the fix the calendar never read `?new=1`.
 * Locators by test id (R-013).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

test("PAD-520: 'Nova aula' on the dashboard opens the new-class sheet once", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);
  await page.getByTestId("dashboard-new-class").click();
  await page.waitForURL(/\/calendar/);
  const sheet = page.getByTestId("add-class-sheet");
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/[?&]new=/);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(1_000); // nothing reopens it
  await expect(sheet).toHaveCount(0);
});
