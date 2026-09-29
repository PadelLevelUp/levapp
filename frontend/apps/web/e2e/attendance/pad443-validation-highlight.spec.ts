/**
 * PAD-443 — attendance.validation rules 23-24, dashboard.blocks rule 11.
 *
 * 1. The sidebar's Presences badge shows the dashboard validation card's number, in the tier the
 *    shared `validationTier` gives it (yellow 1-5 "attention", red above 5 "urgent").
 * 2. In the validate view, a player who still needs a decision is flagged until marked.
 *
 * The seed's "E2E Validation Class" (previous week) leaves one enrolled student silent, so the
 * dashboard falls back to last week and that student has no mark. Marking only edits the dialog's
 * local state — nothing is validated, so no shared data changes. Test ids and data attributes only,
 * never rendered copy (B-103).
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

function firstNumber(text: string | null): number {
  const match = (text ?? "").match(/\d+/);
  expect(match, `a number in "${text}"`).not.toBeNull();
  return Number(match![0]);
}

const tierFor = (count: number) => (count <= 5 ? "attention" : "urgent");

test("PAD-443: the Presences badge is the dashboard's number, with its tier", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);

  const card = page.getByTestId("dashboard-queue-validation");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const cardCount = firstNumber(await card.getByTestId("dashboard-queue-validation-count").textContent());
  expect(cardCount).toBeGreaterThan(0);
  await expect(card.getByTestId("dashboard-queue-validation-count")).toHaveAttribute("data-tier", tierFor(cardCount));

  const badge = page.getByTestId("nav-presences-badge");
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toHaveAttribute("data-tier", tierFor(cardCount));
  expect(firstNumber(await badge.textContent())).toBe(cardCount);
});

test("PAD-443: an undecided player stands out in the validate view until marked", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/presences?validate=1&week=-1");

  const flagged = page.locator('[data-testid^="validate-list-row-"][data-undecided="true"]').first();
  await expect(flagged).toBeVisible({ timeout: 15_000 });
  // Keyed by class AND player: the same student can sit in two queued classes.
  const rowId = await flagged.getAttribute("data-testid");
  const key = rowId!.replace("validate-list-row-", "");
  const row = page.getByTestId(rowId!);
  await expect(page.getByTestId(`validate-list-undecided-icon-${key}`)).toBeVisible();

  await row.getByTestId("presence-mark-present").click();
  await expect(row).toHaveAttribute("data-undecided", "false");
  await expect(page.getByTestId(`validate-list-undecided-icon-${key}`)).toHaveCount(0);
});
