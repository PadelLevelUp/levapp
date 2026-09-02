import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

// PAD-53: EXERCISE_TYPE_OPTIONS / DIFFICULTY_OPTIONS labels are now rendered via
// i18n keys (training.exerciseType.<code> / training.difficulty.<code>) instead of
// the raw English `label` field from packages/types. The seeded e2e-coach defaults
// to English, so this asserts the default English copy renders correctly and that
// no raw i18n key ever leaks onto the page.

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
});

test("PAD-53: exercise type/difficulty filters and form show localized labels, not raw keys", async ({ page }) => {
  // --- Filter dropdowns on the exercises list page ---
  // Both filters default to their "all" option, so the trigger itself shows
  // "All types" / "All difficulties" (SelectValue renders the matched SelectItem).
  const typeFilterTrigger = page.getByRole("combobox").filter({ hasText: /all types/i });
  await typeFilterTrigger.click();
  await expect(page.getByRole("option", { name: "Attack" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("option", { name: "Custom" })).toBeVisible();
  await page.keyboard.press("Escape");

  const difficultyFilterTrigger = page.getByRole("combobox").filter({ hasText: /all difficulties/i });
  await difficultyFilterTrigger.click();
  await expect(page.getByRole("option", { name: "Beginner" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("option", { name: "Expert" })).toBeVisible();
  await page.keyboard.press("Escape");

  // No raw i18n key should ever leak onto the page.
  await expect(page.getByText(/training\.exerciseType\.|training\.difficulty\./)).toHaveCount(0);

  // --- New Exercise form Selects ---
  await page.getByRole("button", { name: /new exercise/i }).first().click();
  await expect(page.getByRole("heading", { name: /new exercise/i })).toBeVisible({ timeout: 5000 });

  // Form defaults to type="attack" / difficulty=1, so the trigger already shows
  // "Attack" / "Beginner" — locate by that text (no label/select association exists
  // in the markup, so getByLabel does not work here).
  const typeSelect = page.getByRole("combobox").filter({ hasText: "Attack" });
  await typeSelect.click();
  await expect(page.getByRole("option", { name: "Attack" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("option", { name: "Warm-up" })).toBeVisible();
  await page.keyboard.press("Escape");

  const difficultySelect = page.getByRole("combobox").filter({ hasText: "Beginner" });
  await difficultySelect.click();
  await expect(page.getByRole("option", { name: "Beginner" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("option", { name: "Intermediate" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByText(/training\.exerciseType\.|training\.difficulty\./)).toHaveCount(0);

  // --- Create an exercise with default values (type "attack", difficulty 1) and
  // verify the resulting card badge shows the localized label, not the raw key. ---
  const uniqueName = `PAD-53 i18n check ${Date.now()}`;
  await page.getByPlaceholder(/e\.g\. cross-court/i).fill(uniqueName);
  await page.getByRole("button", { name: /create exercise/i }).click();
  await expect(page.getByText(/exercise created/i)).toBeVisible({ timeout: 5000 });

  const card = page.locator("h3", { hasText: uniqueName }).locator("..").locator("..");
  await expect(card.getByText("Attack", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(card.getByText("Beginner", { exact: true })).toBeVisible();

  // Clean up: delete the exercise we created.
  await card.getByRole("button", { name: /delete exercise/i }).click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(/exercise deleted/i)).toBeVisible({ timeout: 5000 });
});
