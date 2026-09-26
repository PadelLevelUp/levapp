/**
 * PAD-442 — attendance.validation rule 25.
 *
 * A class the coach completes in "needs your input" stays there, with its Validate button enabled
 * in place, instead of jumping to "ready to confirm". It is regrouped only on the next load.
 *
 * The seed's "E2E Validation Class" (previous week) leaves one enrolled student silent. Marking is
 * a local edit (nothing is validated), so no shared data changes. Test ids only (B-103).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

test("PAD-442: a completed class stays under needs-input with Validate enabled", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/presences?validate=1&week=-1");

  const needsInput = page.getByTestId("presences-group-needsInput");
  const flagged = needsInput.locator('[data-testid^="validate-list-row-"][data-undecided="true"]').first();
  await expect(flagged).toBeVisible({ timeout: 15_000 });
  const rowId = (await flagged.getAttribute("data-testid"))!;
  const card = page.locator('[data-testid="presences-class-card"]', { has: page.getByTestId(rowId) });
  await expect(card.getByTestId("presences-validate-class")).toBeDisabled();

  await page.getByTestId(rowId).getByTestId("presence-mark-present").click();

  // Still in needs-input, now enabled in place — not moved to the ready group.
  await expect(needsInput.getByTestId(rowId)).toBeVisible();
  await expect(page.getByTestId("presences-group-ready").getByTestId(rowId)).toHaveCount(0);
  await expect(card.getByTestId("presences-validate-class")).toBeEnabled();

  // The next load regroups by the server's state: the mark was never saved, so it is back to
  // needing a decision.
  await page.reload();
  await expect(page.getByTestId("presences-group-needsInput").getByTestId(rowId)).toBeVisible({ timeout: 15_000 });
});
