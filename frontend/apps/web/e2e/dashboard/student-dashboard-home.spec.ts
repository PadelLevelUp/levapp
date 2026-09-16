import { test, expect, type Page } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-202 — the student dashboard speaks the coach home's design language.
 *
 * Spec: dashboard.blocks rules 3, 3a, 3b; dashboard.navigation rule 9 and the
 * "Student invite opens that exact class" criterion.
 *
 * The seeded e2e-student is enrolled in "E2E Academy Class" (next Monday
 * 10:00, always inside the 7-day window) with a Presence that is invited but
 * not yet confirmed — so the payload carries a hero, one invite in the queue,
 * and one schedule row, and the page can be asserted on real data rather than
 * empty states.
 */

const SEEDED_CLASS = "E2E Academy Class";

type Block = { id?: string; type?: string; data?: Record<string, unknown> };
type Payload = { id?: string; blocks?: Block[] };

async function loadDashboard(page: Page): Promise<Payload> {
  const payload = page.waitForResponse(
    (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  await openDashboard(page);
  return (await payload).json();
}

test.describe("PAD-202: student dashboard home", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test("PAD-202: the payload is the home vocabulary, keyed by id", async ({ page }) => {
    const payload = await loadDashboard(page);

    expect(payload.id).toBe("player_default_v1");
    const types = (payload.blocks ?? []).map((b) => b.type);
    expect(types).toEqual([
      "messages_overview",
      "next_class",
      "needs_you",
      "schedule_7d",
      "kpi_grid",
    ]);

    // The seeded invite reaches the queue — the old class_list never could.
    const queue = payload.blocks?.find((b) => b.type === "needs_you");
    const items = (queue?.data?.items ?? []) as Array<{ kind: string; classTitle?: string }>;
    expect(items.some((i) => i.kind === "invite" && i.classTitle === SEEDED_CLASS)).toBe(true);
  });

  test("PAD-202: desktop renders greeting, hero, queue, schedule and KPI tiles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadDashboard(page);

    const home = page.getByTestId("student-dashboard");
    await expect(home).toBeVisible({ timeout: 10_000 });

    // The greeting is the page's orientation; there is no "Dashboard" heading.
    await expect(
      page.getByRole("heading", { name: /^(Morning|Afternoon|Evening),/ })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^(Dashboard|Painel)$/ })).toHaveCount(0);

    // The same sections the coach home exposes, under the student root.
    await expect(home.getByTestId("dashboard-next-class")).toBeVisible();
    await expect(home.getByTestId("dashboard-needs-you")).toBeVisible();
    await expect(home.getByTestId("dashboard-schedule")).toBeVisible();
    await expect(home.getByText(/NEEDS YOU/)).toBeVisible();
    // PAD-202 correction: a student's list is the next 30 days, not the week.
    await expect(home.getByText(/UPCOMING ·/)).toBeVisible();

    // The hero is the soonest class — whichever the seed puts first today.
    const firstRow = home.getByTestId("dashboard-schedule-row").first();
    const firstTitle = (await firstRow.locator("span.truncate").first().textContent())?.trim() ?? "";
    expect(firstTitle.length).toBeGreaterThan(0);
    await expect(home.getByTestId("dashboard-next-class")).toContainText(firstTitle);

    // KPI tiles keep their ids and link policy, and now carry a denominator.
    const attended = home.getByTestId("dashboard-kpi-attended");
    await expect(attended).toBeVisible();
    await expect(attended).toHaveAttribute("data-clickable", "true");
    await expect(attended).toContainText(/of \d+ lessons?/);
    await expect(home.getByTestId("dashboard-kpi-missed")).toContainText(/of \d+ lessons?/);
    await expect(home.getByTestId("dashboard-kpi-invites")).toHaveAttribute(
      "data-clickable",
      "false"
    );

    // The invite is a queue card that says which class and when.
    const invite = home.getByTestId("dashboard-queue-invite").first();
    await expect(invite).toBeVisible();
    await expect(invite).toContainText(SEEDED_CLASS);
  });

  test("PAD-202: mobile stacks the same blocks in priority order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDashboard(page);

    const home = page.getByTestId("student-dashboard");
    await expect(home).toBeVisible({ timeout: 10_000 });

    // Every section renders exactly once — the breakpoint is resolved in JS,
    // so nothing is duplicated-and-hidden.
    for (const id of ["dashboard-next-class", "dashboard-needs-you", "dashboard-schedule"]) {
      await expect(home.getByTestId(id)).toHaveCount(1);
    }
    const ids = await home
      .locator("[data-testid^='dashboard-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    const order = ids.filter((id) =>
      ["dashboard-next-class", "dashboard-needs-you", "dashboard-schedule", "dashboard-kpis"].includes(
        id ?? ""
      )
    );
    expect(order).toEqual([
      "dashboard-next-class",
      "dashboard-needs-you",
      "dashboard-schedule",
      "dashboard-kpis",
    ]);
  });

  test("PAD-202: the invite card opens that exact class on the calendar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadDashboard(page);

    const invite = page.getByTestId("dashboard-queue-invite").first();
    await expect(invite).toBeVisible({ timeout: 10_000 });
    await invite.getByRole("button", { name: /open|abrir/i }).click();

    await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 10_000 });
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText(SEEDED_CLASS).first()).toBeVisible();
  });
});

/**
 * PAD-202 correction — a student answers a reminder where they see the class.
 *
 * Spec: dashboard.blocks rule 3a (Yes/No on a pending row) and
 * notifications.reminders rule 13 (answering marks the reminder read).
 *
 * The debug endpoint creates a class two days out with e2e-student enrolled and
 * fires the real reminder job a few seconds later, so the row, the buttons and
 * the unread badge are all driven by a genuine reminder message.
 */
import { API_ROOT } from "../helpers/api";
import {
  COACH_PASSWORD,
  COACH_USERNAME,
  STUDENT_PASSWORD,
  STUDENT_USERNAME,
} from "../helpers/auth";

type Row = { title: string; lessonInstanceId: number | null; pendingConfirmation: boolean };
type Overview = { unreadMessages: number };

async function token(request: import("@playwright/test").APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function studentDashboard(request: import("@playwright/test").APIRequestContext, jwt: string) {
  const res = await request.get(`${API_ROOT}/app/dashboard`, { headers: { Authorization: `Bearer ${jwt}` } });
  expect(res.ok()).toBeTruthy();
  const payload = await res.json();
  const blocks = (payload.blocks ?? []) as Array<{ type: string; data: Record<string, unknown> }>;
  const rows = (blocks.find((b) => b.type === "schedule_7d")?.data.items ?? []) as Row[];
  const overview = blocks.find((b) => b.type === "messages_overview")?.data as Overview | undefined;
  return { rows, unread: overview?.unreadMessages ?? 0 };
}

test.describe("PAD-202: answering a reminder on the dashboard", () => {
  test("PAD-202: Yes on the class row confirms, clears the buttons and drops the unread count", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const coachJwt = await token(request, COACH_USERNAME, COACH_PASSWORD);
    // The debug class starts 48h + 5s from now; the reminder fires "48h before",
    // i.e. in 5 seconds — only if the coach's config says 48h (default is 24h).
    const cfg = await request.post(`${API_ROOT}/app/notify/config`, {
      headers: { Authorization: `Bearer ${coachJwt}` },
      data: {
        autoNotifyEnabled: true,
        reminderTiming: {
          firstReminder: { type: "hours_before", value: 48 },
          reminderCount: 1,
          hoursBetweenReminders: 24,
          invitationStart: { type: "hours_before", value: 24 },
        },
      },
    });
    expect(cfg.ok(), `config ${cfg.status()}`).toBeTruthy();
    const scheduled = await request.post(`${API_ROOT}/app/notify/debug/schedule_reminder_test`, {
      headers: { Authorization: `Bearer ${coachJwt}` },
      data: { secondsUntilReminderFires: 5 },
    });
    expect(scheduled.ok(), `debug endpoint ${scheduled.status()} — is E2E_DEBUG_ENDPOINTS set?`).toBeTruthy();
    const { instanceId } = (await scheduled.json()) as { instanceId: number };

    // Wait for the real reminder job to fire. The debug endpoint may already
    // leave the presence pending; the signal that the REMINDER MESSAGE exists is
    // the unread count rising above its pre-schedule baseline.
    const studentJwt = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const baseline = (await studentDashboard(request, studentJwt)).unread;
    let before = await studentDashboard(request, studentJwt);
    await expect
      .poll(
        async () => {
          before = await studentDashboard(request, studentJwt);
          const pending = before.rows.find((r) => r.lessonInstanceId === instanceId)?.pendingConfirmation ?? false;
          return pending && before.unread > baseline;
        },
        { timeout: 60_000, intervals: [2_000] }
      )
      .toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsStudent(page);
    await loadDashboard(page);

    const row = page.getByTestId("dashboard-schedule-row").filter({ hasText: "E2E Auto-Reminder Test" }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    const yes = row.getByTestId("dashboard-confirm-yes");
    await expect(yes).toBeVisible();
    await expect(row.getByTestId("dashboard-confirm-no")).toBeVisible();

    const refetch = page.waitForResponse(
      (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    );
    await yes.click();
    await refetch;

    await expect(row.getByTestId("dashboard-confirm-yes")).toHaveCount(0);

    const after = await studentDashboard(request, studentJwt);
    expect(after.rows.find((r) => r.lessonInstanceId === instanceId)?.pendingConfirmation).toBe(false);
    expect(after.unread).toBeLessThan(before.unread);
  });
});


/**
 * PAD-236: a waiting-list offer is the most time-sensitive ask a student gets,
 * and it used to live only in the chat. Sent through the engine's own
 * `_offer_waiting_list` (the E2E debug endpoint PAD-124 added), it must show up
 * on the dashboard with Yes/No, and answering there settles it everywhere.
 */
test.describe("PAD-236: chat-born asks reach the student's queue", () => {
  test("PAD-236: a waiting-list offer is a queue card and Yes settles it", async ({
    page,
    request,
  }) => {
    const coachJwt = await token(request, COACH_USERNAME, COACH_PASSWORD);
    const studentJwt = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);

    // The seeded class the student is enrolled in — a materialised instance.
    const { rows } = await studentDashboard(request, studentJwt);
    const seeded = rows.find((r) => r.title === SEEDED_CLASS && typeof r.lessonInstanceId === "number");
    expect(seeded, "seeded class row with an instance id").toBeTruthy();

    const offered = await request.post(`${API_ROOT}/app/notify/debug/offer_waiting_list`, {
      headers: { Authorization: `Bearer ${coachJwt}` },
      data: { lessonInstanceId: seeded!.lessonInstanceId, username: STUDENT_USERNAME },
    });
    expect(offered.ok(), `debug endpoint ${offered.status()} — is E2E_DEBUG_ENDPOINTS set?`).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsStudent(page);
    await loadDashboard(page);

    const card = page.getByTestId("dashboard-queue-waiting-list-offer").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText(SEEDED_CLASS);
    const eyebrow = page.getByTestId("student-dashboard").getByText(/NEEDS YOU · \d+/);
    const before = Number((await eyebrow.textContent())?.match(/\d+/)?.[0] ?? "0");

    const refetch = page.waitForResponse(
      (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    );
    await card.getByTestId("dashboard-confirm-yes").click();
    await refetch;

    await expect(page.getByTestId("dashboard-queue-waiting-list-offer")).toHaveCount(0);
    const after = Number((await eyebrow.textContent())?.match(/\d+/)?.[0] ?? "0");
    expect(after).toBe(before - 1);

    // Settled server-side, not just hidden: the offer no longer comes back.
    const again = await request.get(`${API_ROOT}/app/dashboard`, {
      headers: { Authorization: `Bearer ${studentJwt}` },
    });
    const blocks = ((await again.json()).blocks ?? []) as Array<{ type: string; data: { items?: Array<{ kind: string }> } }>;
    const kinds = (blocks.find((b) => b.type === "needs_you")?.data.items ?? []).map((i) => i.kind);
    expect(kinds).not.toContain("waiting_list_offer");
  });
});
