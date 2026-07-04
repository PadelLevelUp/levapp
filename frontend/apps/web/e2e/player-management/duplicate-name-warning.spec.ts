import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

// PAD-17: Warn (not block) when a player's name duplicates an existing player.
// Matching is exact but case-insensitive. The coach may proceed anyway.
test.describe("PAD-17: Duplicate player name warning in creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-17: name field warns (non-blocking) when it duplicates an existing player, case-insensitively", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add player/i }).click();

    const nameInput = page.getByPlaceholder("e.g. John Doe");
    // "E2E Student" is a seeded player; type it in a different case.
    await nameInput.fill("e2e student");

    // A non-blocking duplicate warning should appear under the Name field.
    const warning = page.getByText(/already have a player.*this name|possible duplicate|duplicate name/i);
    await expect(warning).toBeVisible({ timeout: 3000 });

    // WARN not BLOCK: the create button must stay ENABLED so the coach can proceed.
    await expect(
      page.getByRole("button", { name: /create player/i }),
    ).toBeEnabled();
  });

  test("PAD-17: no warning for a genuinely new name", async ({ page }) => {
    await page.getByRole("button", { name: /add player/i }).click();

    const nameInput = page.getByPlaceholder("e.g. John Doe");
    await nameInput.fill("Totally Unique Newcomer");

    const warning = page.getByText(/already have a player.*this name|possible duplicate|duplicate name/i);
    await expect(warning).not.toBeVisible({ timeout: 2000 });

    await expect(
      page.getByRole("button", { name: /create player/i }),
    ).toBeEnabled();
  });
});
