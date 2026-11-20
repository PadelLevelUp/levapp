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

  // players.list rule 5 (PAD-834): two alerts, "por configurar" (incomplete) and "registo
  // pendente", replace "without level" / "without side"; they are the filters. By test id, never
  // copy. Seed: "Ghost Player" is a placeholder (pending) with no level, so it is in both.
  test("[PLAYERS-LIST-16] the two alerts filter, exclude each other, and \"Ver todos\" clears", async ({
    page,
  }) => {
    const pendingAlert = page.getByTestId("players-alert-pending");
    const incompleteAlert = page.getByTestId("players-alert-incomplete");
    await expect(pendingAlert).toBeVisible({ timeout: 5000 });
    await expect(incompleteAlert).toBeVisible();
    const fullTotal = Number(await page.getByTestId("players-pagination").getAttribute("data-total"));

    await pendingAlert.click();
    await expect(page).toHaveURL(/pending=true/);
    await expect(page.getByTestId("players-filter-clear")).toBeVisible();
    // Wait for the filtered list itself, not a snapshot of the rows that were on screen before it.
    await expect(page.locator('[data-testid^="player-card-"][data-pending="false"]')).toHaveCount(0, { timeout: 10_000 });
    const pendingCards = page.locator('[data-testid^="player-card-"][data-pending="true"]');
    await expect(pendingCards.first()).toBeVisible();
    await expect(pendingCards.first().getByTestId("pending-registration-badge")).toBeVisible();

    await incompleteAlert.click();
    await expect(page).toHaveURL(/incomplete=true/);
    await expect(page).not.toHaveURL(/pending=true/);
    const configured = page.locator(
      // [data-pending] picks the card itself, not its `player-card-name-<id>` line.
      '[data-testid^="player-card-"][data-pending]:not(:has([data-testid="player-row-no-level"])):not(:has([data-testid="player-row-no-side"]))',
    );
    await expect(configured).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('[data-testid^="player-card-"][data-pending]').first()).toBeVisible();

    await page.getByTestId("players-filter-clear").click();
    await expect(page.getByTestId("players-filter-clear")).toHaveCount(0);
    await expect(page.getByTestId("players-pagination")).toHaveAttribute("data-total", String(fullTotal));
  });
});
