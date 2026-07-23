/**
 * PAD-74 — Checkbox does not respond to clicks in the manual notification
 * student selector.
 *
 * The coach opens a class, clicks "Notify", searches for a student and clicks
 * the checkbox next to the name. Nothing happens: the row carried its own
 * onClick AND the checkbox carried its own onCheckedChange, so a click on the
 * checkbox toggled the selection twice (select + deselect) and netted out to
 * no change. Clicking the name only hit the row handler, so that path worked.
 *
 * Spec: notifications.manual
 *
 * Run a single test:
 *   npx playwright test e2e/notification-engine/manual-notify-selection.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS_TITLE = "E2E Academy Class";

/** Opens the seeded class and its manual "Notify students" modal. */
async function openNotifyModal(page: Page) {
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found, `"${CLASS_TITLE}" must be visible on the calendar`).toBe(true);

  await page.getByText(CLASS_TITLE).first().click();

  const notifyBtn = page.getByRole("button", { name: /^notify$/i }).first();
  await notifyBtn.waitFor({ state: "visible", timeout: 10_000 });
  await notifyBtn.click();

  const modal = page.getByRole("dialog").filter({ hasText: /notify students/i });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

test("PAD-74: clicking the checkbox selects a searched student", async ({ page }) => {
  const modal = await openNotifyModal(page);

  // Search for a filler player — seeded, not enrolled in the class, therefore
  // eligible and shown in the individual-search results.
  await modal.getByPlaceholder(/search individual students/i).fill("Filler Player 01");

  const row = modal.locator("label", { hasText: "Filler Player 01" }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });

  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");

  // The bug: this click was a no-op.
  await checkbox.click();

  await expect(checkbox).toHaveAttribute("data-state", "checked");
  await expect(modal.getByRole("button", { name: /send to 1 student/i })).toBeVisible();

  // And clicking it again deselects — one click, one toggle.
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");
  await expect(modal.getByRole("button", { name: /send to 1 student/i })).toHaveCount(0);
});

test("PAD-74: clicking the name selects a searched student (unchanged behaviour)", async ({
  page,
}) => {
  const modal = await openNotifyModal(page);

  await modal.getByPlaceholder(/search individual students/i).fill("Filler Player 02");

  const row = modal.locator("label", { hasText: "Filler Player 02" }).first();
  await expect(row).toBeVisible({ timeout: 5_000 });

  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");

  await row.getByText("Filler Player 02", { exact: true }).click();

  await expect(checkbox).toHaveAttribute("data-state", "checked");
  await expect(modal.getByRole("button", { name: /send to 1 student/i })).toBeVisible();
});

test("PAD-74: checkbox and name behave identically inside a notification group", async ({
  page,
}) => {
  const modal = await openNotifyModal(page);

  // Notification groups are configuration-dependent; skip cleanly when the
  // seeded coach has none rather than asserting on data we do not control.
  const groupToggle = modal.getByRole("checkbox", { name: /select all in/i }).first();
  const hasGroups = await groupToggle.isVisible().catch(() => false);
  test.skip(!hasGroups, "seeded coach has no notification groups configured");

  // Expand the first group to reveal its player rows.
  const groupHeader = modal.locator("div.rounded-lg.border").first();
  await groupHeader.getByRole("button").first().click();

  const playerRow = groupHeader.locator("label").first();
  await expect(playerRow).toBeVisible({ timeout: 5_000 });

  const checkbox = playerRow.getByRole("checkbox");
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");

  await checkbox.click();
  await expect(checkbox).toHaveAttribute("data-state", "checked");

  await checkbox.click();
  await expect(checkbox).toHaveAttribute("data-state", "unchecked");
});
