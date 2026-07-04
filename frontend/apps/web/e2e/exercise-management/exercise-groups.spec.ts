import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openTraining } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openTraining(page);
});

// US-50: Coach can view exercise groups / training plans
test("US-50: training page shows groups or plans section", async ({ page }) => {
  // The training hub has a "Groups" card and an "Exercises" card. Assert on
  // the Groups card heading (the page also shows a "Training" heading both in
  // the banner and the main area, which would cause strict-mode collisions).
  await expect(page.getByRole("heading", { name: /^groups$/i })).toBeVisible({ timeout: 5000 });
});

// US-51: Coach can create an exercise group
test("US-51: coach can create an exercise group", async ({ page }) => {
  // Group creation lives on the dedicated /training/groups page, not the
  // /training hub. Navigate there directly.
  await page.goto("/training/groups");
  await page.waitForURL(/\/training\/groups/);

  await page.getByRole("button", { name: /new group/i }).click();

  const nameInput = page.getByPlaceholder(/attacking training/i);
  await expect(nameInput).toBeVisible({ timeout: 3000 });
  await nameInput.fill("E2E Exercise Group");

  await page.getByRole("button", { name: /create group/i }).click();
  await expect(page.getByText("E2E Exercise Group")).toBeVisible({ timeout: 5000 });
});
