import { test, expect, type Locator } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// PAD-84: the "Coach Levels" ("Níveis do treinador") reorder list gave no clue about
// which direction the list is meant to run. The convention the code actually uses is
// "lower displayOrder = stronger level" (notification_service._level_ids_one_above
// treats a smaller display_order as being ABOVE a vacancy), so the FIRST row is the
// highest skill level and the LAST is the lowest.
//
// The cue is deliberately small: a "Highest" marker on the first row, a "Lowest"
// marker on the last, and a decorative rule + chevron running down between them.
// No explanatory paragraph and no per-row rank — these tests pin that smaller
// surface, including the absence of the two things that were tried and dropped.
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

  /** Makes sure at least `n` level rows are on screen, adding drafts if needed. */
  const ensureRows = async (rows: Locator, addLevel: Locator, n: number) => {
    while ((await rows.count()) < n) await addLevel.click();
  };

  test("PAD-84: list ends are labelled highest and lowest", async ({ page }) => {
    // With at least two levels defined, the ends of the list carry explicit markers
    // so the direction is readable at a glance.
    const rows = page.getByTestId("coach-level-row");
    await ensureRows(rows, page.getByRole("button", { name: /add level/i }), 2);

    const highest = page.getByTestId("coach-level-highest-marker");
    const lowest = page.getByTestId("coach-level-lowest-marker");

    await expect(highest).toBeVisible({ timeout: 10000 });
    await expect(lowest).toBeVisible();
    // Exactly one of each, and each sits on the correct end of the list.
    await expect(highest).toHaveCount(1);
    await expect(lowest).toHaveCount(1);
    await expect(
      rows.first().getByTestId("coach-level-highest-marker")
    ).toHaveCount(1);
    await expect(
      rows.last().getByTestId("coach-level-lowest-marker")
    ).toHaveCount(1);
  });

  test("PAD-84: a decorative arrow shows the top-to-bottom direction", async ({
    page,
  }) => {
    const rows = page.getByTestId("coach-level-row");
    await ensureRows(rows, page.getByRole("button", { name: /add level/i }), 2);

    const arrow = page.getByTestId("coach-level-direction-arrow");
    await expect(arrow).toBeVisible({ timeout: 10000 });
    // The two text markers already carry the meaning, so the arrow is hidden
    // from assistive tech rather than announced as a second, redundant cue.
    await expect(arrow).toHaveAttribute("aria-hidden", "true");
  });

  test("PAD-84: the markers stay on the ends through a live reorder", async ({
    page,
  }) => {
    // The markers are derived from the rendered list index (not the saved
    // displayOrder), so dragging a row must move them immediately.
    const rows = page.getByTestId("coach-level-row");
    await ensureRows(rows, page.getByRole("button", { name: /add level/i }), 3);
    const count = await rows.count();

    // Unique codes so each row can be tracked through the reorder. Nothing is
    // saved in this test, so the seeded levels are left untouched in the DB.
    for (let i = 0; i < count; i++) {
      await rows.nth(i).locator("input").first().fill(`R${i + 1}`);
    }

    // Drag the top row down one slot.
    await rows.nth(0).dragTo(rows.nth(1));

    await expect(rows.nth(0).locator("input").first()).toHaveValue("R2");
    await expect(rows.nth(1).locator("input").first()).toHaveValue("R1");
    // "Highest" followed the new first row, not the row that used to be first.
    await expect(
      rows.first().getByTestId("coach-level-highest-marker")
    ).toHaveCount(1);
    await expect(
      rows.nth(1).getByTestId("coach-level-highest-marker")
    ).toHaveCount(0);
    await expect(
      rows.last().getByTestId("coach-level-lowest-marker")
    ).toHaveCount(1);
  });

  test("PAD-84: no explanatory paragraph and no per-row rank", async ({
    page,
  }) => {
    // Two earlier attempts at the same cue were cut back as too heavy. Pin their
    // absence so they do not creep back in alongside the markers.
    const rows = page.getByTestId("coach-level-row");
    await ensureRows(rows, page.getByRole("button", { name: /add level/i }), 3);
    await expect(page.getByTestId("coach-level-highest-marker")).toBeVisible();

    await expect(page.getByTestId("coach-levels-ordering-hint")).toHaveCount(0);
    await expect(page.getByText(/order matters/i)).toHaveCount(0);
    await expect(page.getByTestId("coach-level-rank")).toHaveCount(0);
    await expect(page.getByText(/rank \d+ of \d+/i)).toHaveCount(0);
  });
});
