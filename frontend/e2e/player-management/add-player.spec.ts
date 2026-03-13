import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
});

// US-35: Coach can add a new player manually
test("US-35: coach adds a new player manually", async ({ page }) => {
  // Open the add-player dialog/sheet
  await page.getByRole("button", { name: /add player|new player|\+/i }).first().click();

  // Use placeholder to avoid ambiguity with the "Username" field (both match /name/i)
  await page.getByPlaceholder("e.g. John Doe").fill("New E2E Player");

  // Submit
  await page.getByRole("button", { name: /save|add|create/i }).last().click();

  // Player should appear in the list
  await expect(page.getByText("New E2E Player")).toBeVisible({ timeout: 5000 });
});

// US-38: Player list shows all enrolled players
test("US-38: player list displays enrolled players", async ({ page }) => {
  // The seeded student should appear
  await expect(page.getByText("E2E Student")).toBeVisible({ timeout: 5000 });
});

// US-39: Coach can view player profile
test("US-39: coach can open player profile", async ({ page }) => {
  // Click on the seeded student
  await page.getByText("E2E Student").click();
  // Should navigate to or open a player detail view
  const detailVisible = await page
    .locator("text=/profile|evaluation|strengths|weaknesses/i")
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(detailVisible).toBe(true);
});
