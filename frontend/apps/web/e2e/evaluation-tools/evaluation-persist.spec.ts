import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

// PAD-56: "Add Evaluation" → "Save evaluation" must actually persist the
// evaluation (previously it showed a false-success toast while nothing saved,
// so the panel stayed "No evaluations yet." even after a reload).
test("PAD-56: saving an evaluation persists it and survives a reload", async ({ page }) => {
  await loginAsCoach(page);

  // Open a seeded player's detail page via the UI.
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await page.getByText("E2E Student", { exact: true }).click();
  await expect(page).toHaveURL(/\/players\/\d+/);

  // The evaluation panel starts empty.
  await expect(page.getByText(/no evaluations yet/i)).toBeVisible();

  // Open the Add Evaluation sheet (categories are lazy-loaded on click).
  await page.getByRole("button", { name: /add evaluation/i }).first().click();

  // The seeded "Forehand" category renders a scorable slider.
  const slider = page.getByRole("slider").first();
  await expect(slider).toBeVisible({ timeout: 8000 });

  // Adjust the score up from the default.
  await slider.focus();
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");

  // Save. Armed BEFORE the click — the persisted effect (the save actually
  // landing), not the toast copy, is the observable here (the page renders
  // pt in E2E).
  const saved = page.waitForResponse(
    (r) => /\/add_evaluation_entry/.test(r.url()) && r.request().method() === "POST" && r.ok(),
    { timeout: 8000 },
  );
  await page.getByRole("button", { name: /save evaluation/i }).click();
  await saved;

  // ...the sheet closes on success (so "Forehand" only remains in the panel)...
  await expect(page.getByRole("button", { name: /save evaluation/i })).toHaveCount(0);

  // ...and the evaluation now shows in the panel (no longer empty).
  await expect(page.getByText(/no evaluations yet/i)).toHaveCount(0);
  await expect(page.getByText("Forehand")).toBeVisible();
  await expect(page.getByText(/\d+ \/ 10/)).toBeVisible();

  // Core assertion: it persisted — a hard reload still shows the evaluation.
  await page.reload();
  await expect(page.getByText("Forehand")).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/\d+ \/ 10/)).toBeVisible();
  await expect(page.getByText(/no evaluations yet/i)).toHaveCount(0);
});
