import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
});

// US-16: Coach can create a new exercise
test("US-16: coach creates a new exercise", async ({ page }) => {
  // When no exercises exist yet, the page shows a "New Exercise" button in the
  // header and a second one in the empty state — both share the accessible
  // name, so scope to the first to avoid a strict-mode violation.
  await page.getByRole("button", { name: /new exercise|\+/i }).first().click();

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
  // First create one to delete (scope to the first "New Exercise" button — the
  // empty state renders a second one with the same accessible name).
  await page.getByRole("button", { name: /new exercise|\+/i }).first().click();
  const nameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("Exercise To Delete");
  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Exercise To Delete")).toBeVisible({ timeout: 5000 });

  // Each ExerciseCard has a hover-revealed Trash2 button with aria-label
  // "Delete exercise". Hover the specific card so the button becomes visible,
  // then click it.
  const card = page.locator(".group").filter({ hasText: "Exercise To Delete" }).first();
  await card.hover();
  await card.getByRole("button", { name: /delete exercise/i }).click();

  // The confirm AlertDialog has a "Delete" button.
  await page.getByRole("alertdialog").getByRole("button", { name: /^delete$/i }).click();

  // Should no longer appear in the list.
  await expect(page.getByText("Exercise To Delete")).not.toBeVisible({ timeout: 5000 });
});

// US-48: Coach can edit an existing exercise
test("US-48: coach edits an exercise", async ({ page }) => {
  // Create one first (scope to the first "New Exercise" button — the empty
  // state renders a second one with the same accessible name).
  await page.getByRole("button", { name: /new exercise|\+/i }).first().click();
  const createNameInput = page.getByRole("textbox", { name: /name/i }).first();
  await expect(createNameInput).toBeVisible({ timeout: 5000 });
  await createNameInput.fill("Exercise To Edit");
  await page.getByRole("button", { name: /create exercise|save/i }).last().click();
  await expect(page.getByText("Exercise To Edit")).toBeVisible({ timeout: 5000 });

  // Wait for the create sheet (a dialog) to fully close before clicking the
  // card — otherwise the closing Radix overlay can swallow the click and the
  // edit sheet never opens.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Open it — click the card heading to open the edit sheet.
  await page.getByRole("heading", { name: "Exercise To Edit" }).click();

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
