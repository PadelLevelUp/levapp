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

  // Only the matching player should be visible (server-side search)
  await expect(page.getByText("E2E Student", { exact: true })).toBeVisible({ timeout: 5000 });

  // Clear and type something that matches nothing
  await searchInput.clear();
  await searchInput.fill("zzz-no-match-zzz");
  // Wait for debounced search to apply
  await page.waitForTimeout(500);
  const noResults = await page
    .locator("text=/no players|no results|empty/i")
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  // Either the list is empty or a "no results" message appears
  const playerCount = await page.getByText("E2E Student", { exact: true }).count();
  expect(noResults || playerCount === 0).toBe(true);
});

// US-37: Coach can edit player details
test("US-37: coach edits player level and side", async ({ page }) => {
  // E2E Student is on page 2 (id-desc with 30 players) — use search to find them
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  // Navigate to the player profile page (exact match to avoid "E2E Student Two")
  await page.getByText("E2E Student", { exact: true }).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // The PlayerHeader has an "Edit" button that toggles inline edit mode
  // (no sheet/dialog — inline Name input + Side/Level Selects + Cancel/Save buttons)
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // Change the side — the Side Select is the first combobox in the header
  const sideSelect = page.locator('[role="combobox"]').first();
  await sideSelect.click();
  await page.getByRole("option", { name: "Left" }).click();

  // Save — button label is "Save" (or "Saving" while in-flight)
  await page.getByRole("button", { name: /^save$/i }).click();

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
  // Ghost Player has status=inactive — they're on page 2 with 30 players total.
  await page.getByPlaceholder(/search/i).first().fill("Ghost Player");
  await page.getByText("Ghost Player").click({ timeout: 5000 });

  // Profile shows "This player doesn't have an account" and the invite link
  await expect(
    page.getByText(/doesn't have an account|can register|invite/i).first()
  ).toBeVisible({ timeout: 5000 });
});
