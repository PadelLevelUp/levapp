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
  const noResults = page.locator("text=/no exercises|no results/i").first();
  // Either empty state or the list is empty
  const emptyVisible = await noResults.isVisible({ timeout: 3000 }).catch(() => false);
  const exerciseCards = await page.locator("[class*='card'], [class*='exercise']").count();
  expect(emptyVisible || exerciseCards === 0).toBe(true);
});
