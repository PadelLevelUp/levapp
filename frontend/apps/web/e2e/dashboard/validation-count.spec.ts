/**
 * PAD-201 / PAD-190 (B-045): the coach dashboard's "classes to validate" card
 * and the Presences tab show ONE number, and the card opens the tab on the
 * week it counted — never the 404 page.
 *
 * Spec: `dashboard.blocks` rule 3 (validation item), `attendance.validation`
 * rule 18. Fixture: the seed's two "E2E Validation Class" instances in the
 * PREVIOUS week, so on any weekday the card falls back to last week and links
 * to `/presences?validate=1&week=-1` (PAD-283: with the validate view open).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

function firstNumber(text: string | null): number {
  const match = (text ?? "").match(/\d+/);
  expect(match, `expected a number in "${text}"`).not.toBeNull();
  return Number(match![0]);
}

test("US-201: the validation card and the Presences trigger agree, and the card opens the tab", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openDashboard(page);

  const card = page.getByTestId("dashboard-queue-validation");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardCount = firstNumber(await card.getByTestId("dashboard-queue-validation-count").textContent());
  expect(cardCount).toBeGreaterThan(0);

  // PAD-300 (load flake, B-079): the tab's own pending list is a fetch that
  // under load lands after the card-count assertion below; wait for it.
  const listLoaded = page.waitForResponse(
    (r) => /\/class_instances\/pending_validation\?/.test(r.url()) && r.status() === 200,
    { timeout: 30_000 }
  );
  await card.getByRole("button", { name: /review|rever/i }).click();
  await page.waitForURL(/\/presences/);
  await listLoaded;
  await expect(page.getByText(/page not found|página não encontrada|404/i)).toHaveCount(0);

  const trigger = page.getByTestId("presences-validate-trigger");
  await expect(trigger).toBeVisible();
  // Wait until the trigger is past its loading state and shows a count.
  await expect(trigger).toContainText(/\d+/, { timeout: 15_000 });
  expect(firstNumber(await trigger.textContent())).toBe(cardCount);

  // PAD-283 (dashboard.blocks rule 10): the card lands INSIDE the validate view
  // on the week it counted — the fixture classes are listed without pressing
  // the trigger or touching the week control.
  await expect(page).toHaveURL(/validate=1/);
  await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(cardCount, {
    timeout: 15_000,
  });
});
