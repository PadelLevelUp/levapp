import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// Helper: navigate forward up to 4 weeks to find the seeded class
async function findSeededClass(page: import("@playwright/test").Page) {
  const title = "E2E Academy Class";
  for (let i = 0; i < 4; i++) {
    const visible = await page.getByText(title).isVisible().catch(() => false);
    if (visible) return true;
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);
  }
  return false;
}

// US-40: Coach can create a new class
test("US-40: coach creates a new class from calendar", async ({ page }) => {
  // Button is labelled "Add class"
  const newClassBtn = page
    .getByRole("button", { name: /add class|new class|\+/i })
    .first();
  await expect(newClassBtn).toBeVisible({ timeout: 5000 });
  await newClassBtn.click();

  // Form/sheet should open — the first field is labelled "Name"
  const nameField = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameField).toBeVisible({ timeout: 5000 });
});

// US-41: Coach can open and view class details
test("US-41: coach can open class detail sheet", async ({ page }) => {
  const found = await findSeededClass(page);
  expect(found).toBe(true);

  await page.getByText("E2E Academy Class").first().click();

  // Detail sheet should open — it shows "Participants" section and "Edit" button
  const detailOpen = await page
    .locator("text=/participants|attendance|edit/i")
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(detailOpen).toBe(true);
});

// US-42: Coach can cancel/reschedule a class instance
test("US-42: delete class option is available in class detail", async ({ page }) => {
  const found = await findSeededClass(page);
  expect(found).toBe(true);

  await page.getByText("E2E Academy Class").first().click();

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

  await page.getByText("E2E Academy Class").first().click();

  const editBtn = page
    .getByRole("button", { name: /edit|update/i })
    .first();
  await expect(editBtn).toBeVisible({ timeout: 5000 });
});
