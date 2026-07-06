import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * PAD-30: Show validation status in player list with watermark for
 * unvalidated profiles.
 *
 * A player who has NOT completed self-service registration (no password set,
 * status "inactive") should render faded with a "Pending registration" badge.
 * A validated player (password set / active) renders normally with no badge.
 *
 * Seed data: "Ghost Player" is inactive with password=None (unvalidated).
 * "E2E Student" is active with a password (validated).
 */
test.describe("PAD-30: player validation watermark", () => {
  test("PAD-30: unvalidated player shows Pending registration badge, validated does not", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    const searchInput = page.getByPlaceholder("Search players...");

    // --- Validated player: no pending badge, not faded ---
    await searchInput.fill("E2E Student");
    const studentCard = page
      .locator('[data-testid^="player-card-"]')
      .filter({ hasText: "E2E Student" })
      .first();
    await expect(studentCard).toBeVisible();
    await expect(
      studentCard.getByText("Pending registration"),
    ).toHaveCount(0);
    await expect(studentCard).toHaveAttribute("data-validated", "true");

    // --- Unvalidated player: pending badge + faded styling ---
    await searchInput.fill("Ghost");
    const ghostCard = page
      .locator('[data-testid^="player-card-"]')
      .filter({ hasText: "Ghost Player" })
      .first();
    await expect(ghostCard).toBeVisible();
    await expect(
      ghostCard.getByText("Pending registration"),
    ).toBeVisible();
    await expect(ghostCard).toHaveAttribute("data-validated", "false");
    // Faded appearance is applied via an opacity utility class.
    await expect(ghostCard).toHaveClass(/opacity-60/);
  });
});
