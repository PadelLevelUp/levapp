/**
 * client.query-cache (PAD-586): a screen seen a moment ago renders from the client cache; older
 * data refreshes once behind it; shared reads are fetched once; nothing polls.
 *
 * Spec: `.specflow/specs/client/query-cache.spec.md`. Requests are counted with
 * `page.on("request")` on the API path (a pathname suffix, so `/app/coach_players` never counts
 * `/app/coach_players_paginated`). Moving between screens uses the sidebar (a client-side route
 * change); `page.goto` would reload the app and empty the cache, which is the thing under test.
 *
 * Role names come from the locale files through `ui()` (R-013); the Presences and Messages links
 * carry a badge inside the link, so those two are reached by their `href`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { ui } from "../helpers/i18n";

test.use({ viewport: { width: 1280, height: 800 } });

/** Counts API requests whose path ends with `pathSuffix`, from the moment this is called. */
function countRequests(page: Page, pathSuffix: string) {
  const state = { count: 0 };
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(pathSuffix)) state.count += 1;
  });
  return state;
}

async function goToPlayers(page: Page) {
  await page.getByRole("link", { name: ui("nav.players") }).first().click();
  await expect(page.getByTestId("players-list")).toBeVisible({ timeout: 15_000 });
}

async function goToCalendar(page: Page) {
  await page.getByRole("link", { name: ui("nav.calendar") }).first().click();
  await page.waitForURL("**/calendar");
}

async function goToDashboard(page: Page) {
  await page.getByRole("link", { name: ui("nav.dashboard") }).first().click();
  await expect(page.getByTestId("dashboard-kpis")).toBeVisible({ timeout: 15_000 });
}

async function goToPresences(page: Page) {
  await page.locator('nav a[href="/presences"]').click();
  await page.waitForURL("**/presences");
}

async function goToMessages(page: Page) {
  await page.locator('nav a[href="/messages"]').click();
  await page.waitForURL("**/messages");
}

test("PAD-586: back to players within the window makes no coach_players_paginated request", async ({ page }) => {
  await loginAsCoach(page);
  await goToPlayers(page);
  await goToCalendar(page);

  const paginated = countRequests(page, "/app/coach_players_paginated");
  await goToPlayers(page);

  await expect(page.getByTestId("players-list")).toBeVisible();
  await expect(page.getByTestId("players-list-loading")).toHaveCount(0);
  // Let any request the mount would have made leave the browser before reading the count.
  await page.waitForTimeout(1_000);
  expect(paginated.count).toBe(0);
});

test("PAD-586: back to players after the window shows the cached rows and refreshes once behind", async ({ page }) => {
  await page.clock.install();
  await loginAsCoach(page);
  await goToPlayers(page);
  await goToCalendar(page);

  // 61 s later every cached read is past QUERY_STALE_TIME_MS (60 s).
  await page.clock.fastForward(61_000);

  // Hold the refresh so "visible before the response" is observable, not a race.
  await page.route("**/app/coach_players_paginated*", async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
    await route.continue();
  });
  const paginated = countRequests(page, "/app/coach_players_paginated");
  await page.getByRole("link", { name: ui("nav.players") }).first().click();

  const list = page.getByTestId("players-list");
  await expect(list).toBeVisible({ timeout: 1_000 });
  await expect(list.locator(":scope > *").first()).toBeVisible();
  await expect(page.getByTestId("players-list-loading")).toHaveCount(0);

  await expect.poll(() => paginated.count, { timeout: 10_000 }).toBe(1);
  // Still the list, never the skeleton, after the refresh landed.
  await expect(list).toBeVisible();
  await expect(page.getByTestId("players-list-loading")).toHaveCount(0);
  expect(paginated.count).toBe(1);
});

test("PAD-586: back to the dashboard within the window makes no dashboard request", async ({ page }) => {
  await loginAsCoach(page);
  await expect(page.getByTestId("dashboard-kpis")).toBeVisible({ timeout: 15_000 });
  await goToMessages(page);

  const dashboard = countRequests(page, "/app/dashboard");
  await goToDashboard(page);

  await expect(page.getByTestId("dashboard-kpis")).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(dashboard.count).toBe(0);
});

test("PAD-586: calendar, presences, calendar fetches the roster and levels once and the unread count at most once", async ({ page }) => {
  await loginAsCoach(page);
  await expect(page.getByTestId("dashboard-kpis")).toBeVisible({ timeout: 15_000 });

  const roster = countRequests(page, "/app/coach_players");
  const levels = countRequests(page, "/app/coach_levels");
  const unread = countRequests(page, "/app/messages/unread_count");

  await goToCalendar(page);
  await goToPresences(page);
  await page.getByTestId("presences-kpi-total").waitFor({ timeout: 15_000 });
  await goToCalendar(page);
  await page.waitForTimeout(1_000);

  expect(roster.count).toBe(1);
  expect(levels.count).toBe(1);
  expect(unread.count).toBeLessThanOrEqual(1);
});

test("PAD-586: next week keeps the previous week's cards on screen until the response arrives", async ({ page }) => {
  await loginAsCoach(page);
  await goToCalendar(page);

  const cards = page.getByTestId("calendar-event-card");
  await expect(cards.first(), "the seeded coach has classes in the current week").toBeVisible({ timeout: 15_000 });

  // Hold the next week's response; the grid must not empty while it is in flight.
  let release!: () => void;
  const held = new Promise<void>((resolveHold) => {
    release = resolveHold;
  });
  let nextWeekRequested = false;
  const calendarRange = /\/api\/app\/calendar\?from=/;
  await page.route(calendarRange, async (route) => {
    nextWeekRequested = true;
    await held;
    await route.continue();
  });

  await page.getByRole("button", { name: ui("calendar.toolbar.nextWeek") }).first().click();
  await expect.poll(() => nextWeekRequested).toBe(true);

  // Sampled across the whole hold, not once.
  for (let sample = 0; sample < 5; sample += 1) {
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(200);
  }

  const response = page.waitForResponse(
    (r) => calendarRange.test(r.url()) && r.status() === 200
  );
  release();
  await response;
  await page.unroute(calendarRange);
});

test("PAD-586: presences requests the trend exactly once on load", async ({ page }) => {
  await loginAsCoach(page);
  await expect(page.getByTestId("dashboard-kpis")).toBeVisible({ timeout: 15_000 });

  const trend = countRequests(page, "/app/presence_trend");
  await goToPresences(page);
  await page.getByTestId("presences-kpi-total").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1_500);

  expect(trend.count).toBe(1);
});

test("PAD-586: no query polls (no refetchInterval in the web app or the shared hooks)", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const roots = [resolve(here, "../../src"), resolve(here, "../../../../packages/hooks/src")];
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && readFileSync(full, "utf8").includes("refetchInterval")) {
        offenders.push(full);
      }
    }
  };
  roots.forEach(walk);

  expect(offenders).toEqual([]);
});
