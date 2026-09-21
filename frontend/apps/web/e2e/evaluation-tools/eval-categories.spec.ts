import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

// US-46: the coach manages their competencies from Settings → Preferences (PAD-373;
// evaluations.competencies rule 11). The category editor that used to sit there is gone:
// the entry opens the one manager — "Gerir competências" — over the page. By test id; this
// test used to pass on EITHER of two pages, which proved neither.
test("US-46: Settings → Preferences opens the competency manager", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/settings?tab=preferences");

  await expect(page.getByTestId("settings-competencies")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("settings-competencies-open").click();

  await expect(page.getByTestId("competency-manager")).toBeVisible({ timeout: 10_000 });
  // The seeded coach already had a category ("Forehand"): it is listed, in the section of
  // the coach's own categories, and the manager is over Settings, not a page of its own.
  await expect(page.getByTestId("competency-group-legacy")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\?.*tab=preferences/);
});

// US-47: Coach can submit an evaluation for a player
//
// Uses "E2E Student Two" (not "E2E Student") because this test optionally
// saves an evaluation as a side effect, and evaluation-persist.spec.ts
// asserts "E2E Student" starts with zero evaluations. Sharing a player
// between the two specs made evaluation-persist.spec.ts order-dependent
// and flaky depending on whether this save actually fired.
test("US-47: coach opens the evaluation form from a player's evaluations", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student Two");
  await page.getByText("E2E Student Two", { exact: true }).click();

  // "Avaliações" opens the drawer; "Nova avaliação" opens the form (PAD-374).
  await page.getByTestId("player-evaluations-open").click({ timeout: 5000 });
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-new").click();

  // Which one shows depends on what the DB has: rows to rate, or the empty state with a way
  // into the competency manager — never a note-only form.
  await expect(page.getByTestId("evaluation-form").or(page.getByTestId("evaluation-form-empty"))).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-form-close").click();
  await expect(page.getByTestId("evaluation-new")).toBeVisible();
});
