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

// PAD-76: a KPI card must never link to a route that does not exist — the
// original bug pointed "Missed" at /presences?status=absent and dropped the
// student on the 404 page.
//
// PAD-141 MOVED THIS TEST FROM "Missed" TO "Invites", and that is a deliberate
// change, not a weakened assertion. The rule under test is `dashboard.navigation`
// rule 6 ("only link where a route exists"), never anything specific to
// "Missed"; "Missed" was simply the KPI that had no route at the time. PAD-141
// creates `/absences`, so "Missed" now SATISFIES rule 6 rather than being
// exempt from it, and it is covered by its own navigation test below.
//
// "Invites" is the KPI that still has no page (`/invites` does not exist), so
// the inert-card behaviour keeps a live guard rather than being deleted along
// with the old example.
test("PAD-76: a KPI with no destination is inert and never lands on the 404 page", async ({
  page,
}) => {
  const invitesCard = page.getByTestId("dashboard-kpi-invites");
  await expect(invitesCard).toBeVisible({ timeout: 10_000 });

  // Not exposed as an interactive control (no button role, no tab stop).
  await expect(invitesCard).toHaveAttribute("data-clickable", "false");
  await expect(page.getByRole("button", { name: /invites/i })).toHaveCount(0);

  await invitesCard.click();
  // Give any (unwanted) client-side navigation a chance to happen.
  await page.waitForTimeout(1000);

  expect(new URL(page.url()).pathname).toMatch(/^\/(dashboard)?$/);
  await expect(page.getByRole("heading", { name: /404/ })).toHaveCount(0);
});

// PAD-141: the counterpart — "Missed" now HAS a destination and must reach it.
test("PAD-141: Missed KPI navigates to the absences page", async ({ page }) => {
  const missedCard = page.getByTestId("dashboard-kpi-missed");
  await expect(missedCard).toBeVisible({ timeout: 10_000 });
  await expect(missedCard).toHaveAttribute("data-clickable", "true");

  await missedCard.click();
  await page.waitForURL("**/absences", { timeout: 10_000 });
  expect(new URL(page.url()).pathname).toBe("/absences");
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
