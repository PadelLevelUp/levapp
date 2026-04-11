import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.describe("PAD-7: Duplicate field validation in player creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-7: shows red error when username is already taken and lets user fix it", async ({
    page,
  }) => {
    // Open the add-player sheet
    await page.getByRole("button", { name: /add player/i }).click();

    // Fill in player details with a taken username
    const playerName = "Duplicate Username Test";
    await page.getByPlaceholder("e.g. John Doe").fill(playerName);
    await page.getByPlaceholder("e.g. johndoe").fill("e2e-student"); // taken
    await page.getByPlaceholder("e.g. john@email.com").fill("dup-test@example.com");

    // Submit the form
    await page.getByRole("button", { name: /create player/i }).click();

    // Should show red error text below the username field
    await expect(
      page.getByText("This username is already taken")
    ).toBeVisible({ timeout: 5000 });

    // Username input should have red border
    const usernameInput = page.getByPlaceholder("e.g. johndoe");
    await expect(usernameInput).toHaveClass(/border-red-500/);

    // Form should still be open with data preserved
    await expect(page.getByText("New player")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue(playerName);
    await expect(page.getByPlaceholder("e.g. john@email.com")).toHaveValue(
      "dup-test@example.com"
    );

    // Fix the username and resubmit
    await usernameInput.fill("unique-dup-test-player");

    // Error should be cleared after editing
    await expect(page.getByText("This username is already taken")).not.toBeVisible();

    await page.getByRole("button", { name: /create player/i }).click();

    // Player should be created successfully
    await expect(page.getByText("Duplicate Username Test")).toBeVisible({
      timeout: 5000,
    });
  });

  test("PAD-7: shows red error when email is already taken", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add player/i }).click();

    await page.getByPlaceholder("e.g. John Doe").fill("Email Dup Test");
    await page.getByPlaceholder("e.g. johndoe").fill("email-dup-test-player");
    await page.getByPlaceholder("e.g. john@email.com").fill("e2e-coach@test.com"); // taken

    await page.getByRole("button", { name: /create player/i }).click();

    // Should show red error on the email field
    await expect(
      page.getByText("This email is already taken")
    ).toBeVisible({ timeout: 5000 });

    const emailInput = page.getByPlaceholder("e.g. john@email.com");
    await expect(emailInput).toHaveClass(/border-red-500/);

    // Form should still be open with data preserved
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue("Email Dup Test");
  });
});
