import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// PAD-15: Coach can set a player's preferred side to "Both" (Left/Right/Both)
test("PAD-15: coach sets player side to Both and it persists", async ({ page }) => {
  // Open the E2E Student profile (exact match to avoid "E2E Student Two")
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await page.getByText("E2E Student", { exact: true }).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // Enter inline edit mode via the PlayerHeader "Edit" button
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });

  // The Side Select is the first combobox in the header — pick the new "Both" option
  const sideSelect = page.locator('[role="combobox"]').first();
  await sideSelect.click();
  await page.getByRole("option", { name: "Both", exact: true }).click();

  // Save
  await page.getByRole("button", { name: /^save$/i }).click();

  // No error, and the "Both" badge is displayed on the profile after save
  const errorVisible = await page
    .getByText(/error|failed/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);

  await expect(page.getByText("Both", { exact: true }).first()).toBeVisible({
    timeout: 5000,
  });

  // Reload to confirm the value was persisted to the backend
  await page.reload();
  await expect(page.getByText("Both", { exact: true }).first()).toBeVisible({
    timeout: 5000,
  });
});
