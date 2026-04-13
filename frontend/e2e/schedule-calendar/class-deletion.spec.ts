import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// Helper: navigate forward up to 4 weeks to find a class by title
async function findClass(page: import("@playwright/test").Page, title: string) {
  for (let i = 0; i < 4; i++) {
    try {
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 3000 });
      return true;
    } catch {
      await page.getByRole("button", { name: /next week/i }).first().click();
      await page.waitForTimeout(300);
    }
  }
  return false;
}

// PAD-10: Deleting a non-recurring class shows success, not an error
test("PAD-10: deleting a non-recurring class shows success toast and updates UI", async ({ page }) => {
  const title = "E2E Academy Class";
  const found = await findClass(page, title);
  expect(found).toBe(true);

  // Open class detail
  await page.getByText(title).first().click();

  // Wait for the detail sheet to open
  const deleteBtn = page.getByRole("button", { name: /delete class/i }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });

  // Click delete — non-recurring class goes directly (no scope dialog)
  await deleteBtn.click();

  // Should show success toast, NOT error toast
  await expect(page.getByText("Class deleted", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Delete failed")).not.toBeVisible();

  // Class should be removed from the calendar grid (not checking toast area)
  await expect(page.getByRole("main").getByText(title)).not.toBeVisible({ timeout: 3000 });
});

// PAD-10: Deleting a single occurrence of a recurring class shows success
test("PAD-10: deleting a single occurrence of recurring class shows success toast", async ({ page }) => {
  const title = "E2E Recurring Class";
  const found = await findClass(page, title);
  expect(found).toBe(true);

  // Open class detail
  await page.getByText(title).first().click();

  // Wait for the detail sheet to open
  const deleteBtn = page.getByRole("button", { name: /delete class/i }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });

  // Click delete — recurring class shows scope dialog
  await deleteBtn.click();

  // Scope dialog should appear — choose "Only this class"
  const singleBtn = page.getByText("Only this class").first();
  await expect(singleBtn).toBeVisible({ timeout: 5000 });
  await singleBtn.click();

  // Should show success toast, NOT error toast
  await expect(page.getByText("Class deleted", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Delete failed")).not.toBeVisible();
});
