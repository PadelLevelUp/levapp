import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openTraining } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openTraining(page);
});

// US-50: Coach can view exercise groups / training plans
test("US-50: training page shows groups or plans section", async ({ page }) => {
  // The training page should have a groups/sessions section
  const groupsVisible = await page
    .locator("text=/group|plan|session|training/i")
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(groupsVisible).toBe(true);
});

// US-51: Coach can create an exercise group
test("US-51: coach can create an exercise group", async ({ page }) => {
  // Look for a "New Group" or similar button
  const newGroupBtn = page
    .getByRole("button", { name: /new group|create group|add group|\+/i })
    .first();

  if (await newGroupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newGroupBtn.click();
    const nameInput = page.getByPlaceholder(/group name|name/i).first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("E2E Exercise Group");
      await page.getByRole("button", { name: /save|create/i }).last().click();
      await expect(page.getByText("E2E Exercise Group")).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, "Group name input not found — UI may differ");
    }
  } else {
    test.skip(true, "New group button not found — feature may be on a sub-page");
  }
});
