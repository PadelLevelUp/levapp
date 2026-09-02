import { test, expect } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";

// PAD-28: Student calendar blockers to prevent auto-invitations.
// A student can access blocker management, create recurring and one-time
// blockers, see a clear visual indication of them, edit and delete them.

test.beforeEach(async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.waitForURL("**/availability");
});

test("US-PAD28: student can access availability blocker management", async ({
  page,
}) => {
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Availability" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: /add blocker/i })
  ).toBeVisible();
});

test("US-PAD28: student can create a one-time blocker and see it listed", async ({
  page,
}) => {
  await page.getByRole("button", { name: /add blocker/i }).click();

  await page.getByLabel(/title/i).fill("Away for work");
  // Default new blocker is one-time. Pick a concrete date/time.
  await page.getByLabel(/^date$/i).fill("2026-08-15");
  await page.getByLabel(/start time/i).fill("18:00");
  await page.getByLabel(/end time/i).fill("20:00");

  await page.getByRole("button", { name: /^save/i }).click();

  // The new blocker appears in the list with a clear "unavailable" indication.
  const listedBlocker = page.getByText("Away for work", { exact: false });
  await expect(listedBlocker).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(/won'?t receive|auto[- ]?invitation|unavailable/i).first()
  ).toBeVisible();
});

test("US-PAD28: student can create a recurring blocker", async ({ page }) => {
  await page.getByRole("button", { name: /add blocker/i }).click();

  await page.getByLabel(/title/i).fill("Monday evenings");
  await page.getByLabel(/^date$/i).fill("2026-08-03");
  await page.getByLabel(/start time/i).fill("18:00");
  await page.getByLabel(/end time/i).fill("20:00");

  // Toggle recurring on.
  await page.getByLabel(/recurring/i).click();

  await page.getByRole("button", { name: /^save/i }).click();

  await expect(
    page.getByText("Monday evenings", { exact: false })
  ).toBeVisible({ timeout: 10_000 });
});

test("US-PAD28: student can delete an existing blocker", async ({ page }) => {
  // Create one first.
  await page.getByRole("button", { name: /add blocker/i }).click();
  await page.getByLabel(/title/i).fill("Temporary blocker");
  await page.getByLabel(/^date$/i).fill("2026-08-20");
  await page.getByLabel(/start time/i).fill("09:00");
  await page.getByLabel(/end time/i).fill("11:00");
  await page.getByRole("button", { name: /^save/i }).click();

  await expect(
    page.getByText("Temporary blocker", { exact: false })
  ).toBeVisible({ timeout: 10_000 });

  // The blocker row is a div containing the title and a delete button.
  const row = page
    .locator("div")
    .filter({ hasText: "Temporary blocker" })
    .filter({ has: page.getByRole("button", { name: /delete blocker/i }) })
    .last();

  await row.getByRole("button", { name: /delete blocker/i }).click();

  // A confirm dialog must appear before the blocker is actually removed.
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^delete$/i })
    .click();

  await expect(
    page.getByText("Temporary blocker", { exact: false })
  ).toHaveCount(0, { timeout: 10_000 });
});
