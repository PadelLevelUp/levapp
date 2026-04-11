import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.describe("PAD-7: Real-time unique field validation in player creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-7: username field turns red when value is already taken", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add player/i }).click();

    // Fill in player name and a taken username
    await page.getByPlaceholder("e.g. John Doe").fill("Duplicate Username Test");
    await page.getByPlaceholder("e.g. john@email.com").fill("dup-test@example.com");

    const usernameInput = page.getByPlaceholder("e.g. johndoe");
    await usernameInput.fill("e2e-student"); // taken username

    // Error should appear automatically (debounced) — no need to click submit
    const errorMsg = page.getByText("This username is already taken");
    await expect(errorMsg).toBeVisible({ timeout: 3000 });
    await expect(usernameInput).toHaveClass(/border-red-500/);

    // Form should still be open with all data preserved
    await expect(page.getByText("New player")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue("Duplicate Username Test");
    await expect(page.getByPlaceholder("e.g. john@email.com")).toHaveValue("dup-test@example.com");

    // Create button should be disabled while there's an error
    await expect(page.getByRole("button", { name: /create player/i })).toBeDisabled();

    // Fix the username — error should clear
    await usernameInput.fill("unique-dup-test-player");
    await expect(errorMsg).not.toBeVisible({ timeout: 3000 });

    // Now submit should work
    await page.getByRole("button", { name: /create player/i }).click();
    await expect(page.getByText("Duplicate Username Test")).toBeVisible({ timeout: 5000 });
  });

  test("PAD-7: email field turns red when value is already taken", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /add player/i }).click();

    await page.getByPlaceholder("e.g. John Doe").fill("Email Dup Test");
    await page.getByPlaceholder("e.g. johndoe").fill("email-dup-test-player");

    const emailInput = page.getByPlaceholder("e.g. john@email.com");
    await emailInput.fill("e2e-coach@test.com"); // taken email

    // Error should appear automatically
    const errorMsg = page.getByText("This email is already taken");
    await expect(errorMsg).toBeVisible({ timeout: 3000 });
    await expect(emailInput).toHaveClass(/border-red-500/);

    // Form data should be preserved
    await expect(page.getByPlaceholder("e.g. John Doe")).toHaveValue("Email Dup Test");
  });
});
