/**
 * PAD-131 (classes.join-requests rules 1, 5, 6, 15): a student asks for the
 * open spot from their own calendar, the coach accepts from the class sheet,
 * and the student is enrolled exactly like any other enrolment.
 *
 * Seed facts: "E2E Pending Confirm Class" is B1, tomorrow 18:00, max 6 with two
 * pending fillers; e2e-student (B1, on e2e-coach's roster) is NOT in it. The
 * coach's open-spot setting and the enrolment are both restored in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS = "E2E Pending Confirm Class";
const STUDENT_NAME = "E2E Student";

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function pendingClass(request: APIRequestContext, auth: Record<string, string>) {
  const events = await request.get(
    `${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`,
    { headers: auth }
  );
  const ev = ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === CLASS);
  expect(ev, "seeded pending-confirm class").toBeTruthy();
  return ev!;
}

async function detail(request: APIRequestContext, auth: Record<string, string>, ev: Record<string, unknown>) {
  const res = await request.post(
    `${API_ROOT}/app/class_instance?model=${ev.model}&id=${ev.originalId}&date=${ev.date}`,
    { headers: auth }
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    participants?: Array<{ id: number | string; user?: { name?: string } }>;
    joinRequests?: Array<{ id: number; playerName: string; status: string }>;
  };
}

test("PAD-131: a student asks for an open spot and the coach's accept enrols them", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const token = await coachToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const ev = await pendingClass(request, auth);
  await request.post(`${API_ROOT}/app/notify/config`, { headers: auth, data: { openSpotsVisible: true } });
  try {
    // The student sees the open spot and asks for it (rule 1).
    await loginAsStudent(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS)).toBe(true);
    await page.locator('[data-open-spot="true"]', { hasText: CLASS }).first().click();
    const studentSheet = page.getByRole("dialog");
    await studentSheet.getByTestId("class-join-request-button").click();
    await expect(studentSheet.getByTestId("class-join-withdraw")).toBeVisible({ timeout: 15_000 });

    // Rule 15: the coach's class payload now carries the pending request.
    const before = await detail(request, auth, ev);
    expect(before.joinRequests?.map((r) => [r.playerName, r.status])).toEqual([[STUDENT_NAME, "pending"]]);

    // The coach accepts from the class sheet (rules 5–6).
    const coachCtx = await browser.newContext();
    const coachPage = await coachCtx.newPage();
    try {
      await loginAsCoach(coachPage);
      await openCalendar(coachPage);
      expect(await findClassOnCalendar(coachPage, CLASS)).toBe(true);
      await coachPage.getByText(CLASS).first().click();
      const coachSheet = coachPage.getByRole("dialog");
      await expect(coachSheet.getByTestId("class-join-request-row")).toHaveCount(1);
      await coachSheet.getByTestId("class-join-accept").click();
      await expect(coachSheet.getByTestId("class-join-request-row")).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await coachCtx.close();
    }

    const after = await detail(request, auth, ev);
    expect(after.joinRequests ?? []).toEqual([]);
    expect((after.participants ?? []).map((p) => p.user?.name)).toContain(STUDENT_NAME);
  } finally {
    // Put the seed back: the class is shared with the manual-notify specs.
    const after = await detail(request, auth, ev);
    const extra = (after.participants ?? []).find((p) => p.user?.name === STUDENT_NAME);
    if (extra) {
      await request.post(`${API_ROOT}/app/edit_class`, {
        headers: auth,
        data: { event: ev, scope: "single", updates: { removePlayers: [String(extra.id)] } },
      });
    }
    await request.post(`${API_ROOT}/app/notify/config`, { headers: auth, data: { openSpotsVisible: false } });
  }
});
