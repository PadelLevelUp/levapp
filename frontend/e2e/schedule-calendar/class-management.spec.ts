import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

const findSeededClass = (page: import("@playwright/test").Page) =>
  findClassOnCalendar(page, "E2E Academy Class");

// US-40: Coach can create a new class
test("US-40: coach creates a new class from calendar", async ({ page }) => {
  // Button is labelled "Add class"
  const newClassBtn = page
    .getByRole("button", { name: /add class|new class|\+/i })
    .first();
  await expect(newClassBtn).toBeVisible({ timeout: 5000 });
  await newClassBtn.click();

  // Form/sheet should open — the Name field has a placeholder like "e.g. Beginner Academy"
  const nameField = page.getByPlaceholder(/beginner academy|private/i).first();
  await expect(nameField).toBeVisible({ timeout: 5000 });
});

// US-41: Coach can open and view class details
test("US-41: coach can open class detail sheet", async ({ page }) => {
  const found = await findSeededClass(page);
  expect(found).toBe(true);

  // Wait for calendar data to settle after the last navigation click
  await page.waitForTimeout(500);
  // Click the event card (not just the text) to avoid draggable <p> interception
  await page.getByText("E2E Academy Class").first().click();

  // Detail sheet should open inside a dialog — wait for it explicitly
  await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });
  const detailOpen = await page
    .locator('[role="dialog"]')
    .getByText(/participants|attendance|edit/i)
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(detailOpen).toBe(true);
});

// US-42: Coach can cancel/reschedule a class instance
test("US-42: delete class option is available in class detail", async ({ page }) => {
  const found = await findSeededClass(page);
  expect(found).toBe(true);

  await page.waitForTimeout(500);
  await page.getByText("E2E Academy Class").first().click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });

  // The class detail sheet has a "Delete class" button (icon-only Trash2 with aria-label)
  const deleteBtn = page.getByRole("button", { name: /delete class/i }).first();
  const cancelBtn = page.getByRole("button", { name: /cancel class|cancel session/i }).first();

  const deleteVisible = await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false);
  const cancelVisible = await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false);
  expect(deleteVisible || cancelVisible).toBe(true);
});

// US-43: Coach can edit class details (title, time, etc.)
test("US-43: edit class option is available in class detail", async ({ page }) => {
  const found = await findSeededClass(page);
  expect(found).toBe(true);

  await page.waitForTimeout(500);
  await page.getByText("E2E Academy Class").first().click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5000 });

  const editBtn = page.locator('[role="dialog"]')
    .getByRole("button", { name: /edit|update/i })
    .first();
  await expect(editBtn).toBeVisible({ timeout: 5000 });
});
