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

async function createClass(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("button", { name: /add class/i }).first().click();
  await page.getByPlaceholder(/beginner academy|private/i).first().fill(title);
  await page.getByRole("button", { name: /create class/i }).click();
  await page.waitForTimeout(800);
  const found = await findClass(page, title);
  expect(found).toBe(true);
}

// PAD-58: deleting a class must ask for confirmation first. Cancel keeps the
// class; confirming removes it. Guards against accidental one-click deletes.
test("PAD-58: deleting a class requires confirmation — Cancel keeps it, Delete removes it", async ({
  page,
}) => {
  const title = "Confirm Delete Class";
  await createClass(page, title);

  // Open the class detail sheet.
  await page.getByText(title).first().click();
  const deleteBtn = page.getByRole("button", { name: /delete class/i }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });

  // Clicking Delete opens a confirmation dialog — it must NOT delete immediately.
  await deleteBtn.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText(/delete this class\?/i)).toBeVisible();

  // Cancel keeps the class: dialog closes, no success toast, detail sheet still
  // open (delete button still present) — nothing was deleted.
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Class deleted", { exact: true })).not.toBeVisible();
  await expect(deleteBtn).toBeVisible();

  // Confirm the delete this time (the detail sheet is still open).
  await deleteBtn.click();
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole("button", { name: /^delete$/i }).click();

  // Now it deletes: success toast, class gone from the grid.
  await expect(page.getByText("Class deleted", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("main").getByText(title)).not.toBeVisible({ timeout: 3000 });
});

// PAD-58: the mobile calendar header week-range label must be compact enough to
// stay on one line at 375px (no stray "de" literal, no 3-line wrap).
test("PAD-58: mobile calendar header week label is compact at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openCalendar(page);

  const label = page.getByRole("heading", { level: 2 }).first();
  await expect(label).toBeVisible({ timeout: 5000 });
  const text = (await label.textContent())?.trim() ?? "";

  // Compact range like "6–13 Jul" or "28 Jun–4 Jul" — short month abbreviations,
  // no Portuguese "de" literal leaking into the English UI.
  expect(text).not.toMatch(/\bde\b/i);
  expect(text.length).toBeLessThanOrEqual(16);

  // The label must render on a single line (height ≈ one text line, not three).
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThan(40);
});
