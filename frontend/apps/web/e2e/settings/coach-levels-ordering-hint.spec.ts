import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// PAD-84: the "Coach Levels" ("Níveis do treinador") reorder list gave no clue about
// which direction the list is meant to run. The convention the code actually uses is
// "lower displayOrder = stronger level" (notification_service._level_ids_one_above
// treats a smaller display_order as being ABOVE a vacancy), so the FIRST row is the
// highest skill level and the LAST is the lowest. These tests pin the helper copy
// that now states that convention.
test.describe("PAD-84: coach levels ordering convention", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openSettings(page);
    // CoachLevelsSection lives in the "Preferences" tab of SettingsPage.
    await page.getByRole("button", { name: /^preferences$/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /coach levels/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("PAD-84: helper text explains that the first level is the highest", async ({ page }) => {
    const hint = page.getByTestId("coach-levels-ordering-hint");

    await expect(hint).toBeVisible({ timeout: 10000 });
    // States the convention in both directions: first = highest, last = lowest.
    await expect(hint).toContainText(/highest/i);
    await expect(hint).toContainText(/lowest/i);
    await expect(hint).toContainText(/first/i);
    await expect(hint).toContainText(/last/i);
  });

  test("PAD-84: list ends are labelled highest and lowest", async ({ page }) => {
    // With at least two levels defined, the ends of the list carry explicit markers
    // so the direction is readable at a glance without reading the paragraph.
    const rows = page.getByTestId("coach-level-row");
    const count = await rows.count();

    if (count < 2) {
      // Seeded coaches have levels; if not, add two so the markers can render.
      const addLevel = page.getByRole("button", { name: /add level/i });
      for (let i = count; i < 2; i++) await addLevel.click();
    }

    await expect(page.getByTestId("coach-level-highest-marker")).toBeVisible();
    await expect(page.getByTestId("coach-level-lowest-marker")).toBeVisible();
  });
});
