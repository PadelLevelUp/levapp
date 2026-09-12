/**
 * PAD-288 (`attendance.confirm` rules 21–24, criterion "A cancellation a month
 * ahead is accepted and shows as cancelled by the student").
 *
 * The student cancels a class more than a week out from the class detail — no
 * horizon (rule 21). The spot frees through the engine's own rules (rule 22),
 * the coach is NOT pushed (rule 23; the backend test pins the push), and both
 * views show "cancelled by the student" with the time: the student's own
 * state word (PAD-313 rule 25 superseded the separate panel), and the coach's
 * participants row, which also carries the cancellation as a detail line.
 *
 * Setup mirrors pad282-cancel-requested-class.spec.ts: the class is booked and
 * accepted through the API (a class the student requested follows the same
 * rule, rule 24), the assertions go through the UI. Everything created is
 * removed in `finally`.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

const STUDENT_NAME = "E2E Student";
const STUDENT_USERNAME = "e2e-student";
const STUDENT_PASSWORD = "E2eStudent123!";

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function token(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function dayEvents(request: APIRequestContext, auth: Record<string, string>, day: string) {
  const res = await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Array<Record<string, unknown>>;
}

/**
 * Walk forward week by week until the class CARD is on screen, then open it.
 * Not `findClassOnCalendar`: that helper matches the title anywhere on the
 * page, and the student's own name sits in the sidebar user chip, so on the
 * student's calendar it reports "found" on the current week while the class
 * (eight or more days out) is a week or two ahead.
 */
async function openClassDetail(page: Page, weeksToScan: number) {
  await openCalendar(page);
  const card = page.getByTestId("calendar-event-card").filter({ hasText: STUDENT_NAME }).first();
  let found = false;
  for (let week = 0; week < weeksToScan && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, `the class card is within ${weeksToScan} weeks`).toBe(true);
  await card.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

test("US-PAD-288: a student cancels a class eight or more days ahead; both views show it as cancelled by the student", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const coachAuth = { Authorization: `Bearer ${await token(request, COACH_USERNAME, COACH_PASSWORD)}` };
  const studentAuth = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };

  // A free block at least eight days out (rule 21: no horizon; the founders' example was a week).
  const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
  expect(coachesRes.ok()).toBeTruthy();
  const coaches = (await coachesRes.json()) as Array<{ id: string | number; name: string }>;
  const coach = coaches.find((c) => c.name === "E2E Coach") ?? coaches[0];
  expect(coach, "the student is rostered with the seeded coach").toBeTruthy();
  const freeRes = await request.get(
    `${API_ROOT}/app/class-requests/free-blocks?coachId=${coach.id}&from=${isoDaysAhead(8)}&to=${isoDaysAhead(14)}`,
    { headers: studentAuth }
  );
  expect(freeRes.ok()).toBeTruthy();
  const blocks = (await freeRes.json()) as Array<{ date: string; startTime: string; endTime: string }>;
  expect(blocks.length, "a free block exists eight to fourteen days out").toBeGreaterThan(0);
  const slot = blocks[0];
  const day = slot.date;

  try {
    const [h, m] = slot.startTime.split(":").map(Number);
    const end = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const createRes = await request.post(`${API_ROOT}/app/class-requests`, {
      headers: studentAuth,
      data: { coachId: String(coach.id), date: day, startTime: slot.startTime, endTime: end },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const created = await createRes.json();
    const acceptRes = await request.post(`${API_ROOT}/app/class-requests/${created.id}/accept`, { headers: coachAuth });
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy();

    // The student cancels from the class detail (rules 20–21).
    await loginAsStudent(page);
    await openClassDetail(page, 3);
    const cancelBtn = page.getByTestId("class-cancel-attendance");
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });
    const [cancelResponse] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.getByTestId("class-cancel-attendance-confirm").click(),
    ]);
    expect(cancelResponse.status(), await cancelResponse.text()).toBe(200);
    const body = await cancelResponse.json();
    expect(body.action).toBe("declined");
    expect(body.proactive, "eight days out is ahead of the reminder: a proactive decline (rule 22)").toBe(true);

    // PAD-313 rule 25 supersedes rule 23's student-side panel: the student's own
    // state is ONE word on their own row, and the timestamp moved to the coach's
    // row, which is the only place we know WHO cancelled.
    const ownState = page.getByTestId("attendance-state").first();
    await expect(ownState).toBeVisible({ timeout: 10_000 });
    await expect(ownState).toHaveAttribute("data-state", "not_coming");
    await expect(page.getByTestId("class-not-attending")).toHaveCount(0);

    // One count, one meaning (`calendar.event-detail` rule 5): the list header no
    // longer contradicts the capacity header by counting a student who is out.
    await expect(page.getByText(/\(0\/\d+\)/).first()).toBeVisible({ timeout: 10_000 });

    // The server says the same thing (rule 23's derived fields).
    const after = await dayEvents(request, coachAuth, day);
    const instance = after.find((e) => e.type === "class" && e.title === STUDENT_NAME);
    expect(instance?.model).toBe("LessonInstance");
    const presRes = await request.get(`${API_ROOT}/app/lesson_instance/${instance!.originalId}/presences`, { headers: coachAuth });
    expect(presRes.ok()).toBeTruthy();
    const presences = (await presRes.json()) as Array<{ cancelledByStudent?: boolean; cancelledAt?: string | null }>;
    expect(presences).toHaveLength(1);
    expect(presences[0].cancelledByStudent).toBe(true);
    expect(presences[0].cancelledAt).toBeTruthy();

    // The coach's class detail: ONE state word on the row, with the cancellation
    // as a quiet detail beside it — provenance, never a second status
    // (rule 23 as amended by rule 25).
    await loginAsCoach(page);
    await openClassDetail(page, 3);
    const coachRow = page.getByTestId("attendance-row").filter({ hasText: STUDENT_NAME }).first();
    await expect(coachRow.getByTestId("attendance-state")).toHaveAttribute("data-state", "not_coming");
    await expect(coachRow.getByTestId("attendance-cancelled-by-student")).toBeVisible({ timeout: 10_000 });
    // The retired chip must not come back alongside it.
    await expect(coachRow.locator('[data-testid="attendance-signal"]')).toHaveCount(0);
  } finally {
    const leftovers = await dayEvents(request, coachAuth, day);
    for (const e of leftovers) {
      if (e.type === "class" && e.title === STUDENT_NAME) {
        await request.post(`${API_ROOT}/app/remove_class`, { headers: coachAuth, data: { event: e, scope: "single" } });
      }
      if (e.type === "block" && String(e.title).includes(STUDENT_NAME)) {
        await request.delete(`${API_ROOT}/app/calendar_block/${e.originalId}`, { headers: coachAuth, data: { scope: "all" } });
      }
    }
  }
});
