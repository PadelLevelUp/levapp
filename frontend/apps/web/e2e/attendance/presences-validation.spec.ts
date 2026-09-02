/**
 * PAD-140 — the coach-facing "Presenças" tab.
 *
 * Spec: `attendance.validation` (specs/attendance/spec.md).
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
