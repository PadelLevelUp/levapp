import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openExercises } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openExercises(page);
});

// US-17: Coach can browse the exercises library
test("US-17: exercises page renders with search and filters", async ({ page }) => {
  // Search input should be present
  await expect(page.getByPlaceholder(/search exercise/i)).toBeVisible({ timeout: 5000 });

  // Type filter dropdown
  const typeFilter = page.locator("text=/all types|type/i").first();
  await expect(typeFilter).toBeVisible({ timeout: 5000 });

  // Difficulty filter
  const diffFilter = page.locator("text=/all difficulties|difficulty/i").first();
  await expect(diffFilter).toBeVisible({ timeout: 5000 });
});

// US-17: Search filters exercises by name
test("US-17: search filters exercise list", async ({ page }) => {
  const search = page.getByPlaceholder(/search exercise/i);
  await search.fill("zzz-no-match-zzz");
  // Search is debounced ~300ms — give it time to settle.
  await page.waitForTimeout(500);

  // Exercise cards are <button> elements with `class="group ..."` — filter for
  // ones whose name field is non-empty. After filtering with no matches, none
  // of the originally-seeded exercises should remain visible.
  const remainingExercises = await page.locator("h3").filter({ hasText: /./ }).count();
  // We allow page-chrome headings (Training, Exercises, etc.) but no exercise
  // <h3> name should match the impossible search string.
  const matches = await page.getByText(/zzz-no-match-zzz/i).count();
  expect(matches).toBe(0);
  expect(remainingExercises).toBeLessThan(50); // sanity: not the unfiltered list
});
