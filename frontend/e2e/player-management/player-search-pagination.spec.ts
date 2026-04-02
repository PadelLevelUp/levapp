import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// PAD-19: Player search should query the entire database, not just the current page
test("PAD-19: search finds players beyond the current page", async ({ page }) => {
  // The seed creates 30 players total (3 original + 27 filler).
  // With PAGE_SIZE=25 and order_by id desc, the original players
  // (E2E Student, E2E Student Two, Ghost Player) are on page 2.

  // Verify we have more than one page (pagination shows "Page 1 of 2")
  await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible({ timeout: 10_000 });

  // "E2E Student" is NOT on page 1 (they have the lowest IDs).
  // Without server-side search, this search would return no results.
  const searchInput = page.getByPlaceholder(/search/i).first();
  await searchInput.fill("E2E Student");

  // Wait for debounced search to trigger and results to load
  // The matching player card should appear even though it was on page 2
  await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 5_000 });
});

test("PAD-19: search with no matches shows empty state", async ({ page }) => {
  const searchInput = page.getByPlaceholder(/search/i).first();
  await searchInput.fill("zzz-absolutely-no-match-zzz");

  // Should show no player cards — wait for the search to process
  await page.waitForTimeout(1000);
  const playerCards = page.locator('[class*="cursor-pointer"]').filter({ hasText: /zzz/ });
  await expect(playerCards).toHaveCount(0);
});

test("PAD-19: clearing search restores paginated view", async ({ page }) => {
  const searchInput = page.getByPlaceholder(/search/i).first();

  // Search for a specific player
  await searchInput.fill("E2E Student");
  await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 5_000 });

  // Clear search — should restore the paginated view
  await searchInput.clear();
  await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible({ timeout: 5_000 });
});
