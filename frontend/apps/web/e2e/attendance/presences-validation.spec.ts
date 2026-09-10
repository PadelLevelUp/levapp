/**
 * PAD-140 — the coach-facing "Presenças" tab.
 *
 * Spec: `attendance.validation` (.specflow/specs/attendance/validation.spec.md).
 *
 * A coach reviews classes that have already ENDED and finalizes who actually
 * attended. Two states drive the whole surface: a class where every enrolled
 * player answered is "ready to confirm"; one where somebody stayed silent
 * "needs your input" and cannot be validated until the coach decides.
 *
 * Fixture: `E2E Validation Class` in `e2e/scripts/seed.py` — two instances in the
 * PREVIOUS week, one with both students answered, one with a silent student.
 * Previous week, not this one: a past class in the current week crowds the
 * calendar's default view and broke `participant-count-effective.spec.ts`.
 *
 * Authorization is asserted at the HTTP layer, not on the frontend route:
 * these endpoints expose every roster player's attendance, so a student
 * reaching them is a data leak regardless of what the router does
 * (PAD-88 / PAD-115 precedent).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
  loginAsCoach,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";


async function getToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function openQueueAtFixtureWeek(page: import("@playwright/test").Page) {
  await page.getByTestId("presences-validate-trigger").click();
  // The fixture lives in the PREVIOUS week on purpose: a past class in the
  // current week crowds the calendar's default view and perturbs
  // `participant-count-effective.spec.ts`. Navigating back also exercises the
  // week control.
  await page
    .getByRole("button", { name: /previous week|semana anterior/i })
    .click();
  await expect(
    page.locator('[data-testid="presences-class-card"]').first()
  ).toBeVisible({ timeout: 15000 });
}

test.describe("PAD-140: Presences tab", () => {
  test("coach sees the tab, its KPIs and the players table", async ({ page }) => {
    await loginAsCoach(page);
    await page.goto("/presences");

    // The KPI tiles resolve from `/presence_stats`; a rendered number (even 0)
    // means the endpoint answered and the page composed.
    await expect(page.getByTestId("presences-kpi-total")).toBeVisible();
    await expect(page.getByTestId("presences-kpi-players")).toBeVisible();
    await expect(page.getByTestId("presences-charts")).toBeVisible();
    await expect(page.getByTestId("presences-players-table")).toBeVisible();

    // Every roster player appears, including those with no activity — a zero
    // row is the signal a coach needs (spec rule 12).
    await expect(
      page.getByTestId("presences-player-row").first()
    ).toBeVisible();
  });

  test("a silent player blocks validation until the coach decides", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await page.goto("/presences");

    await openQueueAtFixtureWeek(page);

    // The "needs your input" class: its Validate button is disabled while a
    // player has no determination (spec rule 5).
    const notReady = page.locator(
      '[data-testid="presences-class-card"][data-ready="false"]'
    );
    await expect(notReady.first()).toBeVisible();
    await expect(
      notReady.first().getByTestId("presences-validate-class")
    ).toBeDisabled();

    // Deciding the silent player flips the card to ready and unblocks it
    // (spec AC "Deciding the last player unblocks the class").
    await notReady.first().getByTestId("presence-mark-present").last().click();

    const ready = page.locator('[data-testid="presences-class-card"][data-ready="true"]');
    await expect(ready.first()).toBeVisible();
    await expect(
      ready.first().getByTestId("presences-validate-class")
    ).toBeEnabled();
  });

  test("validating a class records attendance and finalizes it", async ({
    page,
    request,
  }) => {
    await loginAsCoach(page);
    await page.goto("/presences");
    await openQueueAtFixtureWeek(page);

    const ready = page
      .locator('[data-testid="presences-class-card"][data-ready="true"]')
      .first();
    await expect(ready).toBeVisible();

    await ready.getByTestId("presences-validate-class").click();

    // The class leaves the pending queue. Deliberately NOT an empty-queue
    // assertion: the fixture's other class still has a silent student and
    // SHOULD stay pending — only the ready one was confirmed.
    await expect(
      page.locator('[data-testid="presences-class-card"][data-ready="true"]')
    ).toHaveCount(0, { timeout: 15000 });
    await expect(
      page.locator('[data-testid="presences-class-card"][data-ready="false"]')
    ).toHaveCount(1);

    // And the rows are actually finalized server-side, not just hidden.
    const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    // Default window is the trailing 90 days, which comfortably covers the
    // previous-week fixture.
    const res = await request.get(
      `${API_APP}/class_instances/pending_validation`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const validatedTitles = body.validated.map((c: { title: string }) => c.title);
    expect(validatedTitles).toContain("E2E Validation Class");
  });

  test("presence endpoints are coach-only", async ({ request }) => {
    const studentToken = await getToken(
      request,
      STUDENT_USERNAME,
      STUDENT_PASSWORD
    );

    // A student reaching these would see every roster player's attendance —
    // `classes.detail-visibility` forbids exactly that.
    for (const path of [
      "presence_stats",
      "presence_trend",
      "class_instances/pending_validation",
    ]) {
      const res = await request.get(`${API_APP}/${path}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status(), `${path} should be coach-only`).toBe(403);
    }
  });

  test("guest attendance is not derived from the invited flag", async ({
    request,
  }) => {
    // Every enrolled player is `invited=True` at materialization, so a naive
    // rule would report the whole roster as guests (spec rule 10).
    const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const res = await request.get(`${API_APP}/presence_stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.players.length).toBeGreaterThan(0);
    const enrolledOnly = body.players.filter(
      (p: { invitesReceived: number }) => p.invitesReceived === 0
    );
    expect(
      enrolledOnly.length,
      "enrolled players must not be counted as guests"
    ).toBeGreaterThan(0);
  });
});

// attendance.validation rule 7a (PAD-191, B-033): a bulk run guards EVERY
// queued class, not only the first. The fixture's two classes are made ready
// (the silent student is marked present), both are selected, and the confirm
// route is slowed down so the in-flight window is observable: while the first
// POST is pending, the second class's Validate button must already be disabled.
test.describe("PAD-191: bulk validation guards every queued class", () => {
  test("classes 2..N are disabled while the run is in flight", async ({ page }) => {
    await loginAsCoach(page);
    await page.goto("/presences");
    await openQueueAtFixtureWeek(page);

    // Earlier tests in this file may already have validated the fixture's
    // ready class; reopen anything validated so the run has N = 2 again
    // (spec rule 9: undo keeps the record, so the class comes back ready).
    const undo = page.getByRole("button", { name: /^(undo|anular)$/i });
    while ((await undo.count()) > 0) {
      const before = await page.locator('[data-testid="presences-class-card"]').count();
      await undo.first().click();
      await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(before + 1, {
        timeout: 15_000,
      });
    }

    // Decide every silent player so both classes are ready to confirm: press
    // the first not-yet-pressed "Present" in each not-ready card until none
    // is left (capped, so a stuck card fails loudly instead of looping).
    const notReady = page.locator('[data-testid="presences-class-card"][data-ready="false"]');
    for (let i = 0; i < 12 && (await notReady.count()) > 0; i++) {
      await notReady
        .first()
        .locator('[data-testid="presence-mark-present"][aria-pressed="false"]')
        .first()
        .click();
    }
    await expect(notReady).toHaveCount(0);
    // N ≥ 2: the fixture's two validation classes, plus whatever else the
    // seed left in that week (an attended-history instance lands there when
    // the suite runs early in the week).
    const readyCards = page.locator('[data-testid="presences-class-card"][data-ready="true"]');
    const n = await readyCards.count();
    expect(n).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: /select all ready|selecionar as prontas/i }).click();
    const bulk = page.getByTestId("presences-validate-selected");
    await expect(bulk).toContainText(String(n));

    // Hold every confirm for a moment so the run is observable mid-flight.
    await page.route("**/api/app/class_instance/presences/confirm", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await bulk.click();
    // During the run: bulk button and BOTH per-class buttons are disabled.
    await expect(bulk).toBeDisabled();
    const validateButtons = page.getByTestId("presences-validate-class");
    await expect(validateButtons).toHaveCount(n);
    for (const button of await validateButtons.all()) {
      await expect(button).toBeDisabled();
    }

    // After the run: both classes validated, exactly once each.
    await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(0, {
      timeout: 20_000,
    });
    await page.unroute("**/api/app/class_instance/presences/confirm");

    // Leave the fixture as the run found it: later specs (dashboard/validation-count,
    // PAD-201) count the seed's classes awaiting validation. Undo keeps the record
    // (spec rule 9), so each class returns to the queue.
    const undoAfter = page.getByRole("button", { name: /^(undo|anular)$/i });
    for (let i = 0; i < 12 && (await undoAfter.count()) > 0; i++) {
      const before = await page.locator('[data-testid="presences-class-card"]').count();
      await undoAfter.first().click();
      await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(before + 1, {
        timeout: 15_000,
      });
    }
    await expect(page.locator('[data-testid="presences-class-card"]')).toHaveCount(n);
  });
});

// attendance.validation rule 17a (PAD-192): the charts follow the table's
// filters. Narrowing the search to one roster player re-derives the ranking
// and split from that row, re-requests the trend for that player, and says so;
// clearing the search restores the roster-wide charts.
test.describe("PAD-192: charts follow the table filters", () => {
  test("a name search narrows the charts and the trend request", async ({ page }) => {
    await loginAsCoach(page);
    await page.goto("/presences");
    await expect(page.getByTestId("presences-charts")).toBeVisible();
    await expect(page.getByTestId("presences-charts-scope")).toHaveCount(0);

    const rowsBefore = await page.getByTestId("presences-player-row").count();
    expect(rowsBefore).toBeGreaterThan(1);

    const trendRequest = page.waitForRequest(
      (r) => /\/api\/app\/presence_trend\?.*playerIds=\d+/.test(r.url()),
      { timeout: 10_000 }
    );
    await page.getByPlaceholder(/search player|procurar jogador/i).fill("E2E Student Two");
    await expect(page.getByTestId("presences-player-row")).toHaveCount(1);
    const request = await trendRequest;
    expect(new URL(request.url()).searchParams.get("playerIds")).toMatch(/^\d+$/);

    await expect(page.getByTestId("presences-charts-scope")).toContainText(
      new RegExp(`1 (of|de) ${rowsBefore} `)
    );

    await page.getByPlaceholder(/search player|procurar jogador/i).fill("");
    await expect(page.getByTestId("presences-player-row")).toHaveCount(rowsBefore);
    await expect(page.getByTestId("presences-charts-scope")).toHaveCount(0);
  });
});
