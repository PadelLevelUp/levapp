import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openPlayers(page);
  // Navigate to the seeded student's profile (card click navigates to detail page)
  await page.getByText("E2E Student").click();
  await page.waitForURL(/\/players\//, { timeout: 5000 });
});

// US-44: Coach adds a strength note to a player
test("US-44: coach adds a strength note", async ({ page }) => {
  // Wait for the Strengths & Weaknesses section to appear
  await expect(page.getByText("Strengths & Weaknesses")).toBeVisible({ timeout: 5000 });

  // The S&W section has its own "Edit" button — it is the last "Edit" on the page
  // (PlayerHeader has the first "Edit"; S&W section has the last)
  await page.getByRole("button", { name: "Edit" }).last().click();

  // After clicking Edit, the strength input appears
  const input = page.getByPlaceholder("Add a strength...");
  await expect(input).toBeVisible({ timeout: 3000 });
  await input.fill("Consistent serve");

  // Click the "Add strength" icon button (aria-label added to component)
  await page.getByRole("button", { name: /add strength/i }).click();

  await expect(page.getByText("Consistent serve")).toBeVisible({ timeout: 5000 });
});

// US-45: Coach adds a weakness note to a player
test("US-45: coach adds a weakness note", async ({ page }) => {
  await expect(page.getByText("Strengths & Weaknesses")).toBeVisible({ timeout: 5000 });

  // Toggle edit mode on the S&W section
  await page.getByRole("button", { name: "Edit" }).last().click();

  // Fill the weakness input
  const input = page.getByPlaceholder("Add a weakness...");
  await expect(input).toBeVisible({ timeout: 3000 });
  await input.fill("Backhand under pressure");

  await page.getByRole("button", { name: /add weakness/i }).click();

  await expect(page.getByText("Backhand under pressure")).toBeVisible({ timeout: 5000 });
});
