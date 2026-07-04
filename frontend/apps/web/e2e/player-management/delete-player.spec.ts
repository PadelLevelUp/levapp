import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.use({ video: "on" });

test.describe("PAD-18: Player deletion with confirmation dialog", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-18: coach can delete a player from the detail page", async ({
    page,
  }) => {
    // Search for the seeded inactive player (will be fully deleted)
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("Ghost Player");
    await expect(page.getByText("Ghost Player")).toBeVisible({
      timeout: 5000,
    });

    // Navigate to the player detail page
    await page.getByText("Ghost Player").click();
    await page.waitForURL(/\/players\/\d+/);

    // Click the delete button
    await page
      .getByRole("button", { name: /delete player/i })
      .click({ timeout: 5000 });

    // Confirmation dialog should appear
    await expect(page.getByText(/are you sure/i)).toBeVisible({
      timeout: 3000,
    });

    // Confirm deletion
    await page.getByRole("button", { name: /confirm|yes|delete$/i }).click();

    // Should redirect back to players list
    await page.waitForURL("**/players", { timeout: 5000 });

    // Verify the player list shows 0 results after searching
    await searchInput.fill("Ghost Player");
    await expect(page.getByText(/0 players/i)).toBeVisible({ timeout: 5000 });
  });

  test("PAD-18: cancel deletion keeps the player", async ({ page }) => {
    // Navigate to a seeded filler player detail
    await page.getByText("Filler Player 01", { exact: true }).click();
    await page.waitForURL(/\/players\/\d+/);

    // Click delete
    await page
      .getByRole("button", { name: /delete player/i })
      .click({ timeout: 5000 });

    // Confirmation dialog should appear
    await expect(page.getByText(/are you sure/i)).toBeVisible({
      timeout: 3000,
    });

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Dialog should close, still on detail page
    await expect(page.getByText(/are you sure/i)).not.toBeVisible({
      timeout: 3000,
    });
    // Player heading should still be visible
    await expect(
      page.getByRole("heading", { name: "Filler Player 01" })
    ).toBeVisible();
  });
});
