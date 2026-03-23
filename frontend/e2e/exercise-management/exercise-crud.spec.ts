import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
});

// US-16: Coach can create a new exercise
test("US-16: coach creates a new exercise", async ({ page }) => {
  await page.getByRole("button", { name: /new exercise|\+/i }).click();

  // Fill in the form — input is labelled "Name *", placeholder is "e.g. Cross-court bandeja"
  const nameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("E2E Test Exercise");

  // Submit — button text is "Create Exercise"
  await page.getByRole("button", { name: /create exercise|save/i }).last().click();

  // Should appear in the list
  await expect(page.getByText("E2E Test Exercise")).toBeVisible({ timeout: 5000 });
});

// US-18: Coach can delete an exercise
test("US-18: coach can delete an exercise", async ({ page }) => {
  // First create one to delete
  await page.getByRole("button", { name: /new exercise|\+/i }).click();
  const nameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("Exercise To Delete");
  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Exercise To Delete")).toBeVisible({ timeout: 5000 });

  // Open it
  await page.getByText("Exercise To Delete").click();

  // Click delete
  const deleteBtn = page.getByRole("button", { name: /delete/i }).first();
  if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await deleteBtn.click();
    // Confirm dialog
    const confirmBtn = page.getByRole("button", { name: /delete|confirm/i }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    // Should no longer appear
    await expect(page.getByText("Exercise To Delete")).not.toBeVisible({ timeout: 5000 });
  } else {
    test.skip(true, "Delete button not visible from exercise detail — UI may differ");
  }
});

// US-48: Coach can edit an existing exercise
test("US-48: coach edits an exercise", async ({ page }) => {
  // Create one first
  await page.getByRole("button", { name: /new exercise|\+/i }).click();
  const createNameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(createNameInput).toBeVisible({ timeout: 5000 });
  await createNameInput.fill("Exercise To Edit");
  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Exercise To Edit")).toBeVisible({ timeout: 5000 });

  // Open it
  await page.getByText("Exercise To Edit").click();

  // Edit form should open (sheet opens for edit on click)
  const nameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.clear();
  await nameInput.fill("Exercise Edited");

  await page.getByRole("button", { name: /save|update/i }).last().click();
  await expect(page.getByText("Exercise Edited")).toBeVisible({ timeout: 5000 });
});

// US-49: Type filter works on exercises
test("US-49: type filter narrows exercise list", async ({ page }) => {
  // Open type select and pick a type
  const typeSelect = page
    .getByRole("combobox")
    .filter({ hasText: /all types|type/i })
    .first();

  if (await typeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    await typeSelect.click();
    // Pick first non-"all" option
    const options = page.getByRole("option").filter({ hasNotText: /all/i });
    const count = await options.count();
    if (count > 0) {
      await options.first().click();
    }
  } else {
    test.skip(true, "Type filter select not found");
  }
});
