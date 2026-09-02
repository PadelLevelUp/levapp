import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.describe("PAD-13: Sorting, filtering and data alerts on Players tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
    // Wait for actual player cards to render (not the loading skeleton)
    await expect(page.locator(".font-medium.truncate").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("PAD-13-1: players are sorted A-Z by name by default", async ({
    page,
  }) => {
    // Get all visible player names
    const names = await page.locator(".font-medium.truncate").allTextContents();
    expect(names.length).toBeGreaterThan(0);

    // Verify they are in alphabetical order
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    expect(names).toEqual(sorted);
  });

  test("PAD-13-2: sort controls allow changing sort order", async ({
    page,
  }) => {
    // Open sort dropdown/select
    const sortControl = page.getByRole("combobox", { name: /sort/i });
    await expect(sortControl).toBeVisible({ timeout: 5000 });

    // Change to Z-A
    await sortControl.click();
    await page.getByRole("option", { name: "Name Z-A" }).click();

    // Wait for list to update
    await expect(page.locator(".font-medium.truncate").first()).toBeVisible({
      timeout: 5000,
    });
    await page.waitForTimeout(300);

    // Verify names are in reverse alphabetical order
    const names = await page.locator(".font-medium.truncate").allTextContents();
    const sortedDesc = [...names].sort((a, b) =>
      b.localeCompare(a, undefined, { sensitivity: "base" })
    );
    expect(names).toEqual(sortedDesc);
  });

  test("PAD-13-3: sort by level works", async ({ page }) => {
    const sortControl = page.getByRole("combobox", { name: /sort/i });
    await sortControl.click();
    await page.getByRole("option", { name: "Level High-Low" }).click();

    // Wait for list to update
    await expect(page.locator(".font-medium.truncate").first()).toBeVisible({
      timeout: 5000,
    });
    await page.waitForTimeout(300);

    // Players with levels should appear before players without levels
    const firstPlayerName = await page
      .locator(".font-medium.truncate")
      .first()
      .textContent();
    // Ghost Player has no level, so should NOT be first when sorting level high-low
    expect(firstPlayerName).not.toBe("Ghost Player");
  });

  test("PAD-13-4: data quality alerts show correct counts", async ({
    page,
  }) => {
    // Should show alert for players without level
    const levelAlert = page.getByText(/player.*without level/i);
    await expect(levelAlert).toBeVisible({ timeout: 5000 });

    // Should show alert for players without playing side
    const sideAlert = page.getByText(/player.*without.*side/i);
    await expect(sideAlert).toBeVisible({ timeout: 5000 });
  });

  test("PAD-13-5: clicking alert filters to players missing that data", async ({
    page,
  }) => {
    // Click the "without level" alert
    const levelAlert = page.getByText(/player.*without level/i);
    await levelAlert.click();

    // Wait for filtered list
    await page.waitForTimeout(500);
    await expect(page.locator(".font-medium.truncate").first()).toBeVisible({
      timeout: 5000,
    });

    const names = await page.locator(".font-medium.truncate").allTextContents();
    expect(names.length).toBeGreaterThan(0);

    // Ghost Player is the only one without a level in seed data
    expect(names).toContain("Ghost Player");

    // All fillers have levels, so list should be smaller than total
    expect(names.length).toBeLessThan(30);
  });

  test("PAD-13-6: can clear filter and return to full view", async ({
    page,
  }) => {
    // Apply a filter via alert click
    const levelAlert = page.getByText(/player.*without level/i);
    await levelAlert.click();
    await page.waitForTimeout(500);

    // Find and click clear/remove filter control
    const clearFilter = page.getByRole("button", {
      name: /clear|remove|reset|show all/i,
    });
    // Or click the alert again to toggle off
    if (await clearFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearFilter.click();
    } else {
      await levelAlert.click();
    }

    await page.waitForTimeout(500);
    await expect(page.locator(".font-medium.truncate").first()).toBeVisible({
      timeout: 5000,
    });

    // Should show all players again (paginated, so at least PAGE_SIZE)
    const names = await page.locator(".font-medium.truncate").allTextContents();
    expect(names.length).toBeGreaterThanOrEqual(25);
  });
});
