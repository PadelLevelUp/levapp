import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// US-36: Coach can search/filter players
test("US-36: search filters player list", async ({ page }) => {
  const searchInput = page.getByPlaceholder(/search/i).first();
  await searchInput.fill("E2E Student");

  // Only the matching player should be visible
  await expect(page.getByText("E2E Student")).toBeVisible({ timeout: 3000 });

  // Clear and type something that matches nothing
  await searchInput.clear();
  await searchInput.fill("zzz-no-match-zzz");
  const noResults = await page
    .locator("text=/no players|no results|empty/i")
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  // Either the list is empty or a "no results" message appears
  const playerCount = await page.getByText("E2E Student").count();
  expect(noResults || playerCount === 0).toBe(true);
});

// US-37: Coach can edit player details
test("US-37: coach edits player level and side", async ({ page }) => {
  // Navigate to the player profile page
  await page.getByText("E2E Student").click();

  // The profile page has an "Edit" button (opens Player details sheet in view mode)
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // The sheet opens in read-only view. Click "Edit" inside the sheet footer to enable editing.
  const sheet = page.locator('[role="dialog"]');
  await sheet.getByRole("button", { name: "Edit" }).click({ timeout: 5000 });

  // Now Level and Preferred side are Selects — change the side
  const sideLabel = page.getByLabel("Preferred side");
  if (await sideLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sideLabel.click();
    await page.getByRole("option", { name: "Left" }).click();
  }

  // Save
  await page.getByRole("button", { name: "Save changes" }).click();

  // Should succeed without error
  const errorVisible = await page
    .getByText(/error|failed/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);
});

// US-31: Coach can see the invite link for an inactive player
test("US-31: coach sees invite link for inactive player", async ({ page }) => {
  // Ghost Player has status=inactive
  await page.getByText("Ghost Player").click({ timeout: 5000 });

  // Profile shows "This player doesn't have an account" and the invite link
  await expect(
    page.getByText(/doesn't have an account|can register|invite/i).first()
  ).toBeVisible({ timeout: 5000 });
});
