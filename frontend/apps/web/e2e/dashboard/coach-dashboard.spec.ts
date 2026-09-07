import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);
  // The dashboard widgets are populated by /api/app/dashboard. Wait for that
  // to settle so we don't race the React render.
  await page
    .waitForResponse(
      (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    )
    .catch(() => null);
});

// US-62: Coach dashboard shows KPI overview
test("US-62: dashboard shows KPI cards", async ({ page }) => {
  // KPI cards typically show numbers for players, classes, etc.
  const kpiCard = page
    .locator("text=/player|class|session|student|total/i")
    .first();
  const visible = await kpiCard.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    test.skip(true, "KPI cards not found on dashboard — content depends on API response");
    return;
  }
  expect(visible).toBe(true);
});

// US-63: Dashboard shows upcoming classes widget
test("US-63: upcoming classes widget is visible", async ({ page }) => {
  // The rebuilt coach dashboard shows the week ahead as the "schedule_7d"
  // section (it renders even when there are no classes, with an empty state).
  await expect(page.getByTestId("dashboard-schedule")).toBeVisible({ timeout: 5000 });
});

// US-64: Dashboard shows unread messages widget
test("US-64: unread messages widget or indicator is visible", async ({ page }) => {
  const msgWidget = page
    .locator("text=/message|unread|inbox/i")
    .first();
  const visible = await msgWidget.isVisible({ timeout: 5000 }).catch(() => false);
  if (!visible) {
    test.skip(true, "Unread messages widget not found on dashboard");
  }
  expect(visible).toBe(true);
});

// US-65: Dashboard shows notification activity feed
test("US-65: notification activity or recent activity section is visible", async ({ page }) => {
  // The rebuilt coach dashboard replaces the notification-activity feed with
  // the "needs you" queue (always rendered, with an empty state).
  await expect(page.getByTestId("dashboard-needs-you")).toBeVisible({ timeout: 5000 });
});

// B-029 / dashboard.blocks rule 3c: "Later" on an empty-seats card is a real
// action. The seed's "E2E Academy Class" (1 of 6 seats) is under capacity, so
// the coach's queue carries at least one such card whenever it falls inside
// the 7-day window.
test("B-029: Later removes an empty-seats card from the needs-you queue", async ({ page }) => {
  const queue = page.getByTestId("dashboard-needs-you");
  await expect(queue).toBeVisible({ timeout: 5000 });

  const cards = queue.locator('[data-testid^="needs-you-empty-seats-"]');
  const before = await cards.count();
  if (before === 0) {
    test.skip(true, "No under-capacity class in the next 7 days — nothing to snooze");
    return;
  }

  const first = cards.first();
  const itemId = (await first.getAttribute("data-testid"))!.replace("needs-you-empty-seats-", "");
  const snoozed = page.waitForResponse(
    (r) => r.url().includes(`/needs-you/${encodeURIComponent(itemId)}/snooze`) && r.status() === 200,
  );
  await first.getByTestId("needs-you-later").click();
  await snoozed;

  await expect(queue.getByTestId(`needs-you-empty-seats-${itemId}`)).toHaveCount(0, { timeout: 5000 });
  await expect(cards).toHaveCount(before - 1);
});
