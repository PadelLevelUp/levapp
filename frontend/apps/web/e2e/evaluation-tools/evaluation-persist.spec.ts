import { test, expect } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME } from "../helpers/auth";
import { clickPlayerCard } from "../helpers/players";

// PAD-56, carried into the record form (PAD-374): an evaluation the coach gives must actually
// persist — the old sheet once showed a false-success toast while nothing saved. "Nova avaliação"
// saves each input as it is made, so the observable is the PUT landing and the history card being
// there after a hard reload. Test ids and state attributes only, never rendered copy (B-103).
test("PAD-56: an evaluation given in the form persists and survives a reload", async ({ page }) => {
  await loginAsCoach(page);

  // Open a seeded player's detail page via the UI.
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await expect(page).toHaveURL(/\/players\/\d+/);
  await expect(page.getByTestId("evaluation-card")).toBeVisible();

  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-new").click();

  // The seeded "Forehand" category is a legacy 1-10 one: a number with a stepper, never stars.
  const plus = page.getByTestId("evaluation-form").getByTestId(/^evaluation-stepper-\d+-plus$/).first();
  await expect(plus).toBeVisible({ timeout: 8000 });
  // Armed BEFORE the click: the save landing is the observable, not a toast.
  const saved = page.waitForResponse(
    (r) => /\/evaluation_record/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
    { timeout: 8000 },
  );
  await plus.click();
  await saved;
  await page.getByTestId("evaluation-finish").click();
  await expect(page.getByTestId("evaluation-form")).toHaveCount(0);

  // The evaluation is a history card now, holding a rated stepper value.
  const card = page.getByTestId(/^evaluation-history-card-\d+$/).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId(/^evaluation-stepper-\d+-value$/).first()).not.toHaveAttribute("data-score", "");

  // Core assertion: it persisted — a hard reload still shows it.
  await page.reload();
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId(/^evaluation-history-card-\d+$/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("evaluation-history-empty")).toHaveCount(0);
});
