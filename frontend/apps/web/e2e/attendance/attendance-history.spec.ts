/**
 * PAD-114 — "Presenças": attendance-history sub-page.
 *
 * Spec: `attendance.history` (.specflow/specs/attendance/history.spec.md).
 *
 * One page, two entry points:
 *   * `/attendance`                     — the signed-in student's own history
 *   * `/players/:playerId/attendance`   — a coach viewing one roster player
 *
 * The chart sits at the top, the range controls (1W / 1M / 1Y / …) sit BELOW it,
 * and the list of attended classes sits below those. Only presences are shown —
 * this is never a "missed classes" page.
 *
 * Authorization is asserted at the HTTP layer, not on the frontend route:
 * PAD-88 / PAD-115 are the precedent for route-level guards that left the data
 * endpoint wide open.
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

/** Waits for the next /attendance_history payload and returns it. */
async function waitForHistory(page: Page, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/attendance_history/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    ),
    action(),
  ]);
  return response.json();
}

// ───────────────────────────────────────────────────────────────────────────
// Student — own attendance page
// ───────────────────────────────────────────────────────────────────────────

test.describe("PAD-114 student attendance page", () => {
  test("student opens their own attendance page: chart, range controls, history", async ({
    page,
  }) => {
    await loginAsStudent(page);

    const payload = await waitForHistory(page, async () => {
      await page.goto("/attendance");
    });

    // Chart at the top.
    await expect(page.getByTestId("attendance-chart")).toBeVisible({
      timeout: 15_000,
    });

    // Range controls BELOW the chart.
    for (const key of ["1w", "1m", "1y", "custom"]) {
      await expect(page.getByTestId(`attendance-range-${key}`)).toBeVisible();
    }

    const chartBox = await page.getByTestId("attendance-chart").boundingBox();
    const controlsBox = await page
      .getByTestId("attendance-range-controls")
      .boundingBox();
    expect(chartBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox!.y).toBeGreaterThan(chartBox!.y);

    // History list below. The default range is the current month, which may
    // legitimately hold no attended classes depending on today's date — assert
    // the two states explicitly rather than leaving a count that silently
    // becomes `toHaveCount(0)` and stops proving anything. Row rendering itself
    // is covered by the custom-period and deep-link specs below.
    await expect(page.getByTestId("attendance-history-list")).toBeVisible();
    if (payload.sessions.length === 0) {
      await expect(page.getByTestId("attendance-history-empty")).toBeVisible();
      await expect(page.getByTestId("attendance-chart")).toHaveAttribute(
        "data-state",
        "empty"
      );
    } else {
      await expect(page.getByTestId("attendance-history-item")).toHaveCount(
        payload.sessions.length
      );
    }
  });

  test("range presets re-query with the right span and granularity", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await waitForHistory(page, async () => {
      await page.goto("/attendance");
    });

    const yearly = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-range-1y").click();
    });
    expect(yearly.granularity).toBe("month");
    expect(yearly.buckets).toHaveLength(12);
    // Current year. The payload's `from`/`to` are naive UTC ISO strings, so
    // compare the literal year rather than letting `new Date()` re-interpret
    // them in the runner's local timezone (PAD-33 territory).
    expect(yearly.from.slice(0, 4)).toBe(
      String(new Date().getUTCFullYear())
    );

    const weekly = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-range-1w").click();
    });
    expect(weekly.granularity).toBe("day");
    expect(weekly.buckets).toHaveLength(7);

    const monthly = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-range-1m").click();
    });
    expect(monthly.granularity).toBe("day");
    // Current month, bucketed by day: 28..31 buckets.
    expect(monthly.buckets.length).toBeGreaterThanOrEqual(28);
    expect(monthly.buckets.length).toBeLessThanOrEqual(31);
  });

  // Regression guard. The chart used to render its axes, grid, tooltips and a
  // <g> per bucket while drawing NO bar marks at all: recharts grows each bar
  // from zero height via requestAnimationFrame, a zero-height Rectangle renders
  // nothing, and wherever rAF is throttled the animation never advanced. The
  // page then read as "no attendance" while the payload said otherwise —
  // invisible to every assertion that only checked the payload or the container.
  test("bar marks are actually drawn for non-empty periods", async ({ page }) => {
    await loginAsStudent(page);
    await waitForHistory(page, async () => {
      await page.goto("/attendance");
    });

    // Deliberately a custom two-year window rather than the 1Y preset: the
    // window always contains every seeded attended class, so this guard can
    // never quietly skip itself. Anchored to 1Y it would find an empty current
    // year on any run in early January and skip — which is the same "green
    // while checking nothing" failure the test exists to prevent.
    await page.getByTestId("attendance-range-custom").click();
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 730 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.getByTestId("attendance-custom-from").fill(from);
    await page.getByTestId("attendance-custom-to").fill(to);

    const payload = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-custom-apply").click();
    });
    const nonEmpty = payload.buckets.filter(
      (b: { count: number }) => b.count > 0
    ).length;
    expect(nonEmpty).toBeGreaterThan(0);

    await expect(page.getByTestId("attendance-chart")).toHaveAttribute(
      "data-state",
      "ready"
    );
    // One <path class="recharts-rectangle"> per bucket that actually has a count.
    const marks = page.locator(
      '[data-testid="attendance-chart"] .recharts-rectangle'
    );
    await expect(marks).toHaveCount(nonEmpty, { timeout: 10_000 });

    // ...and they have real height, not a collapsed baseline sliver.
    const heights = await marks.evaluateAll((nodes) =>
      nodes.map((n) => Number(n.getAttribute("height") ?? 0))
    );
    expect(Math.min(...heights)).toBeGreaterThan(1);
  });

  test("custom period widens the range, then Clear restores the preset view", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await waitForHistory(page, async () => {
      await page.goto("/attendance");
    });

    // No Clear control until a custom period is actually applied.
    await expect(page.getByTestId("attendance-range-clear")).toHaveCount(0);

    await page.getByTestId("attendance-range-custom").click();
    await expect(page.getByTestId("attendance-custom-from")).toBeVisible();
    await expect(page.getByTestId("attendance-custom-to")).toBeVisible();

    // A window wide enough to contain every seeded attended class.
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 730 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    await page.getByTestId("attendance-custom-from").fill(from);
    await page.getByTestId("attendance-custom-to").fill(to);

    const custom = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-custom-apply").click();
    });

    // Granularity follows the span (two years -> yearly buckets).
    expect(custom.granularity).toBe("year");
    // The seed plants 5 attended classes across the last ~250 days.
    expect(custom.sessions.length).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId("attendance-history-item")).toHaveCount(
      custom.sessions.length
    );

    // Clear appears while the custom period is active, and drops it.
    const clear = page.getByTestId("attendance-range-clear");
    await expect(clear).toBeVisible();

    const cleared = await waitForHistory(page, async () => {
      await clear.click();
    });
    expect(cleared.granularity).toBe("day");
    await expect(page.getByTestId("attendance-range-clear")).toHaveCount(0);
    // And a new custom period can be defined afterwards.
    await expect(page.getByTestId("attendance-range-custom")).toBeVisible();
  });

  test("clicking an attended class opens that exact class in the calendar", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await waitForHistory(page, async () => {
      await page.goto("/attendance");
    });

    // Widen to a range that certainly holds seeded history.
    const yearly = await waitForHistory(page, async () => {
      await page.getByTestId("attendance-range-1y").click();
    });
    test.skip(
      yearly.sessions.length === 0,
      "no attended classes in the current year"
    );

    // The deep link the row will follow, and the class it points at.
    const target = yearly.sessions[0];
    expect(target.href).toMatch(
      /^\/calendar\?classId=lessoninstance-\d+&date=\d{4}-\d{2}-\d{2}$/
    );

    const first = page.getByTestId("attendance-history-item").first();
    await expect(first).toBeVisible();
    // Keyboard reachable (dashboard.navigation rule 10 parity).
    await expect(first).toHaveAttribute("role", "button");

    await first.click();
    await page.waitForURL("**/calendar**", { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/calendar");

    // CalendarPage consumes `classId`/`date` and then strips them from the URL,
    // so the assertion that matters is the OUTCOME: the calendar is showing that
    // class's week with its detail sheet already open.
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(
      sheet.getByRole("heading", { name: target.title })
    ).toBeVisible();
    await expect(sheet).toContainText(/participants|attendance/i);
  });

  test("the dashboard 'Attended' KPI is the student entry point", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await page.goto("/");
    const attended = page.getByTestId("dashboard-kpi-attended");
    await expect(attended).toBeVisible({ timeout: 15_000 });
    await expect(attended).toHaveAttribute("data-clickable", "true");

    await attended.click();
    await page.waitForURL("**/attendance", { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/attendance");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Coach — a roster player's attendance page
// ───────────────────────────────────────────────────────────────────────────

test.describe("PAD-114 coach viewing a roster player", () => {
  test("coach reaches a roster player's attendance from the player profile", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await page.goto("/players");

    await page
      .getByText("E2E Student", { exact: true })
      .first()
      .click({ timeout: 15_000 });
    await page.waitForURL(/\/players\/\d+$/, { timeout: 15_000 });
    const playerId = new URL(page.url()).pathname.split("/").pop();

    const payload = await waitForHistory(page, async () => {
      await page.getByTestId("player-attendance-link").click();
    });

    await page.waitForURL(`**/players/${playerId}/attendance`, {
      timeout: 15_000,
    });
    expect(String(payload.playerId)).toBe(playerId);

    await expect(page.getByTestId("attendance-chart")).toBeVisible();
    await expect(page.getByTestId("attendance-range-controls")).toBeVisible();
    // The page names whose history is shown.
    await expect(page.getByTestId("attendance-subject")).toContainText(
      "E2E Student"
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Authorization (HTTP layer — PAD-88 / PAD-115 precedent)
// ───────────────────────────────────────────────────────────────────────────

test.describe("PAD-114 attendance_history authorization", () => {
  test("anonymous callers are rejected", async ({ request }) => {
    const res = await request.get(`${API_BASE}/attendance_history`);
    expect(res.status()).toBe(401);
  });

  test("a coach cannot read the attendance of a player off their roster", async ({
    request,
  }) => {
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
      `${API_BASE}/attendance_history?playerId=${target.playerId}`,
      { headers: bearer(coachToken) }
    );
    expect(ownRes.status()).toBe(200);

    // ...a coach with no roster relation to that player cannot.
    const otherCoachToken = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD
    );
    const foreignRes = await request.get(
      `${API_BASE}/attendance_history?playerId=${target.playerId}`,
      { headers: bearer(otherCoachToken) }
    );
    expect(foreignRes.status()).toBe(403);
    expect(await foreignRes.text()).not.toContain("sessions");
  });

  test("a student cannot read another student's attendance", async ({
    request,
  }) => {
    const coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const rosterRes = await request.get(`${API_BASE}/coach_players`, {
      headers: bearer(coachToken),
    });
    const roster = await rosterRes.json();
    const list = Array.isArray(roster) ? roster : roster.players ?? [];
    const me = list.find((p: { name?: string }) => p.name === "E2E Student");
    const other = list.find(
      (p: { name?: string }) => p.name === "E2E Student Two"
    );
    expect(me && other).toBeTruthy();

    const studentToken = await getToken(
      request,
      STUDENT_USERNAME,
      STUDENT_PASSWORD
    );

    // Own data: allowed.
    const ownRes = await request.get(
      `${API_BASE}/attendance_history?playerId=${me.playerId}`,
      { headers: bearer(studentToken) }
    );
    expect(ownRes.status()).toBe(200);

    // Somebody else's: 403.
    const foreignRes = await request.get(
      `${API_BASE}/attendance_history?playerId=${other.playerId}`,
      { headers: bearer(studentToken) }
    );
    expect(foreignRes.status()).toBe(403);
  });

  test("only presences are returned — absences never appear", async ({
    request,
  }) => {
    const studentToken = await getToken(
      request,
      STUDENT_USERNAME,
      STUDENT_PASSWORD
    );
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 730 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const res = await request.get(
      `${API_BASE}/attendance_history?from=${from}&to=${to}`,
      { headers: bearer(studentToken) }
    );
    expect(res.status()).toBe(200);
    const payload = await res.json();

    // Buckets are contiguous and their counts add up to the session list.
    const total = payload.buckets.reduce(
      (sum: number, b: { count: number }) => sum + b.count,
      0
    );
    expect(total).toBe(payload.sessions.length);
    expect(payload.sessions.length).toBeGreaterThanOrEqual(5);

    // Every returned session is a materialized instance with a calendar deep link.
    for (const s of payload.sessions) {
      expect(s.href).toMatch(
        /^\/calendar\?classId=lessoninstance-\d+&date=\d{4}-\d{2}-\d{2}$/
      );
    }
  });
});
