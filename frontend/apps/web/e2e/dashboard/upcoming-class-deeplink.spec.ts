import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-79 — Dashboard "Upcoming classes" must deep-link into the specific class.
 *
 * Spec: dashboard.navigation rules 8–10, calendar.event-detail rules 10–12.
 *
 * The seeded "E2E Academy Class" always falls on NEXT Monday (see e2e/scripts/seed.py),
 * i.e. never in the week the calendar shows by default. So a click that only lands on
 * /calendar leaves the coach on the wrong week with nothing selected — which is exactly
 * the bug. Clicking must select the class's week AND open its detail sheet.
 */

const SEEDED_CLASS = "E2E Academy Class";

/** Waits for the dashboard payload and returns it. */
async function waitForDashboardPayload(page: Page): Promise<any> {
  const response = await page.waitForResponse(
    (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  return response.json();
}

/** Flattens nested `grid` blocks so every class_list block is reachable. */
function collectClassListItems(blocks: any[]): any[] {
  const items: any[] = [];

  for (const block of blocks ?? []) {
    if (block?.type === "grid") {
      items.push(...collectClassListItems(block.data?.children ?? []));
    } else if (block?.type === "class_list") {
      items.push(...(block.data?.items ?? []));
    }
  }

  return items;
}

// PAD-79: the href the backend emits must carry both the class id and its date.
test("PAD-79: dashboard class_list items link to a specific class, not the bare calendar", async ({
  page,
}) => {
  await loginAsCoach(page);
  const payloadPromise = waitForDashboardPayload(page);
  await openDashboard(page);
  const dashboard = await payloadPromise;

  const items = collectClassListItems(dashboard.blocks);
  expect(items.length).toBeGreaterThan(0);

  for (const item of items) {
    // /calendar?classId=<calendar event id>&date=<YYYY-MM-DD>
    expect(item.href).toMatch(/^\/calendar\?classId=[^&]+&date=\d{4}-\d{2}-\d{2}$/);
    expect(decodeURIComponent(item.href.split("classId=")[1].split("&")[0])).toBe(item.id);
  }
});

// PAD-79: clicking an upcoming class opens THAT class, on its own week.
test("PAD-79: clicking an upcoming class opens its detail sheet on the right week", async ({
  page,
}) => {
  await loginAsCoach(page);
  const payloadPromise = waitForDashboardPayload(page);
  await openDashboard(page);
  await payloadPromise;

  const upcomingRow = page
    .getByRole("button", { name: new RegExp(SEEDED_CLASS, "i") })
    .first();
  await expect(upcomingRow).toBeVisible({ timeout: 10_000 });
  await upcomingRow.click();

  await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 10_000 });

  // The class detail sheet for that exact occurrence is already open.
  const sheet = page.locator('[role="dialog"]').first();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(SEEDED_CLASS).first()).toBeVisible();

  // The deep-link params are consumed once, so closing the sheet does not re-open it.
  await expect
    .poll(() => new URL(page.url()).search, { timeout: 10_000 })
    .toBe("");

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  // And we are left on the week that actually contains the class — the event is
  // rendered in the calendar grid behind the (now closed) sheet.
  await expect(page.getByText(SEEDED_CLASS).first()).toBeVisible({ timeout: 10_000 });
});

// PAD-79: the same deep link works from the student dashboard.
test("PAD-79: student upcoming lesson opens its detail sheet on the right week", async ({
  page,
}) => {
  await loginAsStudent(page);
  const payloadPromise = waitForDashboardPayload(page);
  await openDashboard(page);
  const dashboard = await payloadPromise;

  const items = collectClassListItems(dashboard.blocks);
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) {
    expect(item.href).toMatch(/^\/calendar\?classId=[^&]+&date=\d{4}-\d{2}-\d{2}$/);
  }

  const upcomingRow = page
    .getByRole("button", { name: new RegExp(SEEDED_CLASS, "i") })
    .first();
  await expect(upcomingRow).toBeVisible({ timeout: 10_000 });
  await upcomingRow.click();

  await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 10_000 });

  const sheet = page.locator('[role="dialog"]').first();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(SEEDED_CLASS).first()).toBeVisible();
});
