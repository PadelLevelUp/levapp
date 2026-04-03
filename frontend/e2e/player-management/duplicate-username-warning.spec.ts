import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.describe("PAD-7: Duplicate username warning in player creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-7: shows warning when username already exists and preserves form data", async ({
    page,
  }) => {
    // Open the add-player sheet
    await page.getByRole("button", { name: /add player/i }).click();

    // Fill in player details
    const playerName = "Duplicate Username Test";
    await page.getByPlaceholder("e.g. John Doe").fill(playerName);
    await page.getByPlaceholder("e.g. johndoe").fill("e2e-student"); // existing username
    await page.getByPlaceholder("e.g. john@email.com").fill("dup-test@example.com");

    // Submit the form
    await page.getByRole("button", { name: /create player/i }).click();

    // Should show a warning about the duplicate username
    await expect(
      page.getByText(/username already exists/i)
    ).toBeVisible({ timeout: 5000 });

    // Form should still be open — the sheet title should still be visible
    await expect(page.getByText("New player")).toBeVisible();

    // Form fields should still be populated (data preserved)
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue(playerName);
    await expect(page.getByPlaceholder("e.g. john@email.com")).toHaveValue(
      "dup-test@example.com"
    );

    // Modify the username to something unique and resubmit
    await page
      .getByPlaceholder("e.g. johndoe")
      .fill("unique-dup-test-player");
    await page.getByRole("button", { name: /create player/i }).click();

    // Player should be created successfully — should appear in the list
    await expect(page.getByText("Duplicate Username Test")).toBeVisible({
      timeout: 5000,
    });
  });
});
