/**
 * PAD-201 / PAD-190 (B-045): the coach dashboard's "classes to validate" card
 * and the Presences tab show ONE number, and the card opens the tab on the
 * week it counted — never the 404 page.
 *
 * Spec: `dashboard.blocks` rule 3 (validation item), `attendance.validation`
 * rule 18. PAD-539 (B-342): that number is the coach's WHOLE backlog, and the
 * card lands on the most recent week with something pending; the list on that
 * week holds that week's share, which the trigger's second line names.
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
  // on the most recent week with work — that week's classes are listed without
  // pressing the trigger or touching the week control. PAD-539: the list holds
  // the WEEK's share (the trigger's second line), not the whole backlog.
  await expect(page).toHaveURL(/validate=1/);
  const weekLine = page.getByTestId("presences-validate-week");
  await expect(weekLine).not.toHaveText("…");
  const weekCount = Number(((await weekLine.textContent()) ?? "").match(/\d+/)?.[0] ?? "0");
  expect(weekCount).toBeGreaterThan(0); // the landing week always has work
  expect(weekCount).toBeLessThanOrEqual(cardCount);
  await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(weekCount, {
    timeout: 15_000,
  });
});
