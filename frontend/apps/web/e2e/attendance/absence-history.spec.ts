/**
 * PAD-141 — "Faltas": the absence-history sub-page.
 *
 * Spec: `attendance.absences` (specs/attendance/spec.md).
 *
 * One page, two entry points, mirroring PAD-114:
 *   * `/absences`                     — the signed-in student's own absences
 *   * `/players/:playerId/absences`   — a coach viewing one roster player
 *
 * The assertions that actually matter here are the ones that could NOT pass by
 * accident:
 *
 *   * the page's total agrees with the dashboard "Missed" KPI — the failure
 *     this feature is most likely to ship with is a page that quietly filters
 *     justified absences and shows a smaller number than the card the student
 *     clicked to reach it;
 *   * the absences page and the attendance page return disjoint classes, so
 *     neither can be silently reading the other's endpoint;
 *   * the chart draws bars with real height. PAD-114 shipped green with an
 *     invisible chart because recharts grows bars from zero via rAF and a
 *     zero-height Rectangle renders as an empty <g>; asserting "the chart
 *     exists" would not have caught it, and will not here.
 *
 * Authorization is asserted at the HTTP layer, not on the frontend route —
 * PAD-88 / PAD-115 are the precedent for route guards that left the endpoint
 * wide open.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  COACH_USERNAME,
  COACH_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  COACH_NOLEVELS_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
  loginAsCoach,
  loginAsStudent,
} from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

const API_BASE = `${API_ROOT}/app`;

/** A window wide enough to contain every seeded absence (oldest is 200d back). */
const WIDE_FROM = "2020-01-01";
const WIDE_TO = "2035-01-01";

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function openAbsences(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/absence_history/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    ),
    page.goto("/absences"),
  ]);
  await expect(page.getByTestId("absences-history-list")).toBeVisible({
    timeout: 15_000,
  });
  return response.json();
}

/**
 * Widen the page to a two-year window through the `…` custom-range controls.
 *
 * The page keeps its range in component state and does NOT read the query
 * string, so `goto("/absences?from=…&to=…")` silently loads the default 1M
 * preset instead. Two of these tests originally did that and passed only
 * because the seeded absences (10 and 20 days back) happen to fall inside the
 * current calendar month — on the 3rd of any month both land in the previous
 * one and the page would be empty. Driving the real controls makes the range
 * explicit and date-independent.
 */
async function widenToTwoYears(page: Page) {
  await page.getByTestId("attendance-range-custom").click();
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 730 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.getByTestId("attendance-custom-from").fill(from);
  await page.getByTestId("attendance-custom-to").fill(to);

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/absence_history/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    ),
    page.getByTestId("attendance-custom-apply").click(),
  ]);
  return response.json();
}

// ---------------------------------------------------------------------------
// Student UI
// ---------------------------------------------------------------------------

test.describe("PAD-141: student absence history", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test("PAD-141: the page lists all three seeded absences", async ({ page }) => {
    await openAbsences(page);
    await expect(page.getByTestId("absences-subject")).toBeVisible();

    const payload = await widenToTwoYears(page);

    // Counted, not merely "the container exists" — that container renders even
    // with zero absences ("an empty period is a state of the list"), so a
    // visibility-only assertion would pass against an empty page.
    expect(payload.total).toBe(3);
    await expect(page.getByTestId("absences-history-item")).toHaveCount(3);
    await expect(page.getByTestId("absences-history-empty")).toHaveCount(0);
    await expect(page.getByTestId("absences-total")).toContainText("3");
  });

  test("PAD-141: justified and unjustified absences are BOTH listed and labelled", async ({
    page,
    request,
  }) => {
    // Drive the range through the API so the assertion does not depend on
    // today's date landing near the seeded offsets.
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const res = await request.get(
      `${API_BASE}/absence_history?from=${WIDE_FROM}&to=${WIDE_TO}`,
      { headers: bearer(token) }
    );
    expect(res.status()).toBe(200);
    const payload = await res.json();

    const justifications = payload.sessions
      .map((s: { justification?: string | null }) => s.justification)
      .sort();
    // Seed: 2 justified + 1 unjustified. If the page ever filters on
    // justification this is the assertion that fails.
    expect(justifications).toEqual(["justified", "justified", "unjustified"]);
    expect(payload.total).toBe(3);

    // ...and the UI labels each row rather than only counting them.
    await openAbsences(page);
    await widenToTwoYears(page);
    const badges = page.getByTestId("absences-justification");
    await expect(badges).toHaveCount(3);
    await expect(
      page.locator('[data-justification="unjustified"]')
    ).toHaveCount(1);
    await expect(page.locator('[data-justification="justified"]')).toHaveCount(2);
  });

  test("PAD-141: the chart draws bars with real height, not empty groups", async ({
    page,
  }) => {
    // PAD-114's regression: a chart can render with every bar at zero height
    // and still look "present" to a naive locator.
    await openAbsences(page);
    const payload = await widenToTwoYears(page);

    const nonEmpty = payload.buckets.filter(
      (b: { count: number }) => b.count > 0
    ).length;
    // Derived from the payload, so the assertion cannot be satisfied by a
    // chart that drew nothing over a range that genuinely held nothing.
    expect(nonEmpty).toBeGreaterThan(0);

    const marks = page.locator(".recharts-rectangle");
    await expect(marks).toHaveCount(nonEmpty, { timeout: 15_000 });

    const heights = await marks.evaluateAll((nodes) =>
      nodes.map((n) => Number(n.getAttribute("height") ?? 0))
    );
    expect(Math.min(...heights)).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The properties that make this page correct rather than merely present
// ---------------------------------------------------------------------------

test.describe("PAD-141: absences agree with attendance and the KPI", () => {
  test("PAD-141: absences and attendance return disjoint classes", async ({
    request,
  }) => {
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const range = `from=${WIDE_FROM}&to=${WIDE_TO}`;

    const [absences, attendance] = await Promise.all([
      request
        .get(`${API_BASE}/absence_history?${range}`, { headers: bearer(token) })
        .then((r) => r.json()),
      request
        .get(`${API_BASE}/attendance_history?${range}`, { headers: bearer(token) })
        .then((r) => r.json()),
    ]);

    const missed = new Set<number>(
      absences.sessions.map((s: { lessonInstanceId: number }) => s.lessonInstanceId)
    );
    const attended = new Set<number>(
      attendance.sessions.map((s: { lessonInstanceId: number }) => s.lessonInstanceId)
    );

    // Both non-empty first: two empty sets are trivially disjoint, which would
    // make the real assertion vacuous.
    expect(missed.size).toBeGreaterThan(0);
    expect(attended.size).toBeGreaterThan(0);
    // Seed uses different counts (3 vs 5) so reading the wrong endpoint cannot
    // yield a plausible-looking match.
    expect(missed.size).toBe(3);
    expect(attended.size).toBe(5);

    for (const id of missed) {
      expect(attended.has(id), `class ${id} appears on BOTH pages`).toBeFalsy();
    }
  });

  test("PAD-141: the page total matches the dashboard Missed KPI", async ({
    page,
    request,
  }) => {
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const absences = await request
      .get(`${API_BASE}/absence_history?from=${WIDE_FROM}&to=${WIDE_TO}`, {
        headers: bearer(token),
      })
      .then((r) => r.json());

    await loginAsStudent(page);
    await page.goto("/dashboard");
    const missedCard = page.getByTestId("dashboard-kpi-missed");
    await expect(missedCard).toBeVisible({ timeout: 15_000 });

    const kpiValue = Number(
      ((await missedCard.textContent()) ?? "").replace(/\D+/g, "")
    );
    expect(kpiValue).toBe(absences.total);
  });
});

// ---------------------------------------------------------------------------
// HTTP authorization — the real boundary
// ---------------------------------------------------------------------------

test.describe("PAD-141: absence_history authorization", () => {
  test("PAD-141: anonymous callers get 401", async ({ request }) => {
    const res = await request.get(`${API_BASE}/absence_history`);
    expect(res.status()).toBe(401);
  });

  test("PAD-141: a student reads their own absences (200)", async ({ request }) => {
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const res = await request.get(`${API_BASE}/absence_history`, {
      headers: bearer(token),
    });
    expect(res.status()).toBe(200);
  });

  test("PAD-141: the owning coach reads a roster player's absences, another coach gets 403", async ({
    request,
  }) => {
    // The player id comes from the coach's own roster — `/auth/me` does not
    // expose one, and a hardcoded id would rot the moment the seed changes.
    const coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const rosterRes = await request.get(`${API_BASE}/coach_players`, {
      headers: bearer(coachToken),
    });
    expect(rosterRes.ok()).toBeTruthy();
    const roster = await rosterRes.json();
    const target = (Array.isArray(roster) ? roster : roster.players ?? []).find(
      (p: { name?: string }) => p.name === "E2E Student"
    );
    expect(target, "E2E Student must be on the coach roster").toBeTruthy();

    // The owning coach can read it...
    const ownRes = await request.get(
      `${API_BASE}/absence_history?playerId=${target.playerId}`,
      { headers: bearer(coachToken) }
    );
    expect(ownRes.status()).toBe(200);

    // ...a coach with no roster relation to that player cannot.
    const otherCoach = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD
    );
    const res = await request.get(
      `${API_BASE}/absence_history?playerId=${target.playerId}`,
      { headers: bearer(otherCoach) }
    );
    // Asserted as == 403, never != 200: a 500 from an unchecked role would
    // satisfy a loose assertion while still being a bug (PAD-116).
    expect(res.status()).toBe(403);
  });

  test("PAD-141: a student cannot read another student's absences (403)", async ({
    request,
  }) => {
    const coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const roster = await request
      .get(`${API_BASE}/coach_players`, { headers: bearer(coachToken) })
      .then((r) => r.json());
    const others = (Array.isArray(roster) ? roster : roster.players ?? []).filter(
      (p: { name?: string }) => p.name && p.name !== "E2E Student"
    );
    expect(others.length, "need a second player to target").toBeGreaterThan(0);

    const studentToken = await getToken(
      request,
      STUDENT_USERNAME,
      STUDENT_PASSWORD
    );
    const res = await request.get(
      `${API_BASE}/absence_history?playerId=${others[0].playerId}`,
      { headers: bearer(studentToken) }
    );
    expect(res.status()).toBe(403);
  });
});
