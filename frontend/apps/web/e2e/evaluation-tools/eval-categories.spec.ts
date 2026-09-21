import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

// US-46: Coach can manage evaluation categories from settings
test("US-46: evaluation categories page/section is accessible", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/settings");

  // Look for an "Evaluation" section in settings
  const evalSection = page.locator("text=/evaluation categor/i").first();
  const visible = await evalSection.isVisible({ timeout: 5000 }).catch(() => false);

  if (!visible) {
    // Otherwise evaluations are reached from the player detail: the "Avaliações" action (PAD-374).
    await page.goto("/players");
    // E2E Student is on page 2 (id-desc with 30 players) — use search
    await page.getByPlaceholder(/search/i).first().fill("E2E Student");
    await page.getByText("E2E Student", { exact: true }).click();
    await expect(page.getByTestId("player-evaluations-open")).toBeVisible({ timeout: 5000 });
  } else {
    await expect(evalSection).toBeVisible();
  }
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
