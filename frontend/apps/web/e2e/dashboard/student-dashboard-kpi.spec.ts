import { test, expect } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsStudent(page);
  await openDashboard(page);
  // The dashboard blocks are server-driven (/api/app/dashboard). Wait for the
  // payload so we don't race the React render.
  await page
    .waitForResponse(
      (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    )
    .catch(() => null);
});

// PAD-76: the "Missed" KPI used to link to /presences?status=absent, a route
// that does not exist — clicking it dropped the student on the 404 page.
// There is no "missed classes" page yet, so the card must be inert.
test("PAD-76: Missed KPI is not clickable and never lands on the 404 page", async ({
  page,
}) => {
  const missedCard = page.getByTestId("dashboard-kpi-missed");
  await expect(missedCard).toBeVisible({ timeout: 10_000 });

  // Not exposed as an interactive control (no button role, no tab stop).
  await expect(missedCard).toHaveAttribute("data-clickable", "false");
  await expect(page.getByRole("button", { name: /missed/i })).toHaveCount(0);

  await missedCard.click();
  // Give any (unwanted) client-side navigation a chance to happen.
  await page.waitForTimeout(1000);

  expect(new URL(page.url()).pathname).toMatch(/^\/(dashboard)?$/);
  await expect(page.getByRole("heading", { name: /404/ })).toHaveCount(0);
});

// PAD-76 regression guard: KPI cards that DO have a destination must still work.
test("PAD-76: Upcoming lessons KPI still navigates to the calendar", async ({
  page,
}) => {
  const upcomingCard = page.getByTestId("dashboard-kpi-upcoming-lessons");
  await expect(upcomingCard).toBeVisible({ timeout: 10_000 });
  await expect(upcomingCard).toHaveAttribute("data-clickable", "true");

  await upcomingCard.click();
  await page.waitForURL("**/calendar", { timeout: 10_000 });
  expect(new URL(page.url()).pathname).toBe("/calendar");
});
