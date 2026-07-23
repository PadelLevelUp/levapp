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

  test("PAD-84: every row shows its rank and the ranks follow a live reorder", async ({
    page,
  }) => {
    // The endpoint markers only cover rows 1 and N — with 3+ levels the middle
    // rows had no ordering cue at all. Every row now carries its rank, derived
    // from the rendered list index (not the saved displayOrder), so it must stay
    // 1..N while a drag shuffles the rows underneath it.
    const rows = page.getByTestId("coach-level-row");
    const addLevel = page.getByRole("button", { name: /add level/i });
    while ((await rows.count()) < 3) await addLevel.click();
    const count = await rows.count();
    const positions = Array.from({ length: count }, (_, i) => String(i + 1));

    // Unique codes so each row can be tracked through the reorder. Nothing is
    // saved in this test, so the seeded levels are left untouched in the DB.
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").first().fill(`R${i + 1}`);
    }

    const ranks = page.getByTestId("coach-level-rank");
    await expect(ranks).toHaveText(positions);
    // Endpoint markers still there — rank and markers are complementary.
    await expect(page.getByTestId("coach-level-highest-marker")).toHaveCount(1);
    await expect(page.getByTestId("coach-level-lowest-marker")).toHaveCount(1);
    // Screen readers get the meaning of the bare number.
    await expect(rows.first()).toContainText(
      new RegExp(`rank 1 of ${count}`, "i")
    );

    // Drag the top row down one slot.
    await rows.nth(0).dragTo(rows.nth(1));

    await expect(rows.nth(0).locator("input").first()).toHaveValue("R2");
    await expect(rows.nth(1).locator("input").first()).toHaveValue("R1");
    // Ranks are positional: still 1..N, i.e. the moved row now reads "2".
    await expect(ranks).toHaveText(positions);
    await expect(rows.nth(1)).toContainText(new RegExp(`rank 2 of ${count}`, "i"));
  });
});
