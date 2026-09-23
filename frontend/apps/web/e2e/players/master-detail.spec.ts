import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

// PAD-410: /players is now a master-detail page — the roster on the left, the
// selected player's detail on the right, both keeping their own state as the
// selection changes (the same pattern as /messages and /messages/:id).
test.describe("PAD-410: players master-detail", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("selecting a row opens its detail beside the list, without losing the search", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    const searchInput = page.getByTestId("players-search-input");
    await searchInput.fill("E2E Student");

    // Exact match to avoid "E2E Student Two" / "E2E Student Three".
    const firstCard = page
      .locator('[data-testid^="player-card-"]')
      .filter({ hasText: "E2E Student", hasNotText: "Two" })
      .filter({ hasNotText: "Three" })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    await page.waitForURL(/\/players\/\d+$/, { timeout: 5000 });
    await expect(firstCard).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("player-evaluations-action")).toBeVisible({ timeout: 10_000 });

    // Selecting a row never touched what was typed into the search box.
    await expect(searchInput).toHaveValue("E2E Student");

    // Click a second seeded card — the route changes, the selection moves,
    // and the search box still holds what was typed.
    const secondCard = page
      .locator('[data-testid^="player-card-"]')
      .filter({ hasText: "E2E Student Two" })
      .first();
    await expect(secondCard).toBeVisible({ timeout: 10_000 });
    const firstUrl = page.url();
    await secondCard.click();

    await expect(page).not.toHaveURL(firstUrl);
    await page.waitForURL(/\/players\/\d+$/, { timeout: 5000 });
    await expect(secondCard).toHaveAttribute("aria-current", "true");
    await expect(firstCard).not.toHaveAttribute("aria-current", "true");
    await expect(searchInput).toHaveValue("E2E Student");

    // Mobile: the detail takes the full width and the roster (its search
    // box included) is not shown.
    await page.setViewportSize({ width: 390, height: 844 });
    // (Below 640px the profile's actions fold into the ⋮ menu, as they always have.)
    await expect(page.getByTestId("player-detail-pane")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("players-search-input")).toBeHidden();

    // The mobile back control returns to the plain list route.
    await page.getByRole("button", { name: ui("players.backToPlayers") }).click();
    await page.waitForURL("**/players", { timeout: 5000 });
    await expect(page.getByTestId("players-search-input")).toBeVisible();
  });
});
