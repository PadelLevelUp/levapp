import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.describe("PAD-7: Duplicate username warning in player creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-7: shows red error when username already exists and preserves form data", async ({
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

    // Should show a red error message about the duplicate username
    const errorMsg = page.getByText("This username is already taken");
    await expect(errorMsg).toBeVisible({ timeout: 5000 });

    // Username input should have red border
    const usernameInput = page.getByPlaceholder("e.g. johndoe");
    await expect(usernameInput).toHaveClass(/border-red-500/);

    // Form should still be open — the sheet title should still be visible
    await expect(page.getByText("New player")).toBeVisible();

    // Form fields should still be populated (data preserved)
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue(playerName);
    await expect(page.getByPlaceholder("e.g. john@email.com")).toHaveValue(
      "dup-test@example.com"
    );

    // Modify the username to something unique and resubmit
    await usernameInput.fill("unique-dup-test-player");

    // Error should be cleared after editing the username
    await expect(errorMsg).not.toBeVisible();

    await page.getByRole("button", { name: /create player/i }).click();

    // Player should be created successfully — should appear in the list
    await expect(page.getByText("Duplicate Username Test")).toBeVisible({
      timeout: 5000,
    });
  });

  test("PAD-7: shows red error when email already exists", async ({
    page,
  }) => {
    // Open the add-player sheet
    await page.getByRole("button", { name: /add player/i }).click();

    // Fill with a unique username but an existing email
    await page.getByPlaceholder("e.g. John Doe").fill("Email Dup Test");
    await page.getByPlaceholder("e.g. johndoe").fill("email-dup-test-player");
    await page.getByPlaceholder("e.g. john@email.com").fill("e2e-coach@test.com"); // existing email

    // Submit
    await page.getByRole("button", { name: /create player/i }).click();

    // Should show red error about duplicate email
    const errorMsg = page.getByText("This email is already taken");
    await expect(errorMsg).toBeVisible({ timeout: 5000 });

    // Email input should have red border
    const emailInput = page.getByPlaceholder("e.g. john@email.com");
    await expect(emailInput).toHaveClass(/border-red-500/);

    // Form should still be open with data preserved
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue("Email Dup Test");
  });
});
