/**
 * PAD-282 / PAD-288 (`attendance.confirm` rules 18–20, criteria "Student cancels
 * a class they requested for tomorrow" and "The class-detail payload offers the
 * cancel action on a virtual occurrence").
 *
 * A class the coach accepted from the student's own request for TOMORROW never
 * gets a reminder job (its fire time is already past), so nothing materialises
 * it: the student's class detail resolves to the Lesson, with no instance row
 * and no presence. The cancel action must still be offered, and cancelling must
 * materialise the occurrence and record the decline.
 *
 * Setup goes through the API (booking + accept), the assertion through the UI.
 * Everything created is removed in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

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

test("US-PAD-282: a student can cancel a class they requested for tomorrow — it is materialised on demand", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const coachAuth = { Authorization: `Bearer ${await token(request, COACH_USERNAME, COACH_PASSWORD)}` };
  const studentAuth = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
  const day = isoDaysAhead(1);

  try {
    // The student books a free slot tomorrow (classes.class-requests rules 1–2).
    const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
    expect(coachesRes.ok()).toBeTruthy();
    const coaches = (await coachesRes.json()) as Array<{ id: string | number; name: string }>;
    const coach = coaches.find((c) => c.name === "E2E Coach") ?? coaches[0];
    expect(coach, "the student is rostered with the seeded coach").toBeTruthy();
    const freeRes = await request.get(
      `${API_ROOT}/app/class-requests/free-blocks?coachId=${coach.id}&from=${day}&to=${day}`,
      { headers: studentAuth }
    );
    expect(freeRes.ok()).toBeTruthy();
    const blocks = (await freeRes.json()) as Array<{ date: string; startTime: string; endTime: string }>;
    const slot = blocks.find((b) => b.date === day);
    expect(slot, "tomorrow has a free block").toBeTruthy();
    const [h, m] = slot!.startTime.split(":").map(Number);
    const end = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const createRes = await request.post(`${API_ROOT}/app/class-requests`, {
      headers: studentAuth,
      data: { coachId: String(coach.id), date: day, startTime: slot!.startTime, endTime: end },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const created = await createRes.json();

    // The coach accepts (rule 4): a private class with the student, no instance row.
    const acceptRes = await request.post(`${API_ROOT}/app/class-requests/${created.id}/accept`, { headers: coachAuth });
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy();
    const before = await dayEvents(request, studentAuth, day);
    const virtual = before.find((e) => e.type === "class" && e.title === STUDENT_NAME);
    expect(virtual, "the student sees the accepted class").toBeTruthy();
    expect(virtual!.model, "no instance row exists yet — the event is the Lesson itself").toBe("Lesson");

    // The student opens it from the calendar; the cancel action is offered (rule 20).
    await loginAsStudent(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, STUDENT_NAME, 2)).toBe(true);
    // The header shows the student's own name too; click the calendar card, not the user menu.
    await page.getByTestId("calendar-event-card").filter({ hasText: STUDENT_NAME }).first().click();
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    const cancelBtn = page.getByTestId("class-cancel-attendance");
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    const confirmDialog = page.locator('[role="alertdialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    const [cancelResponse] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()),
        { timeout: 10_000 }
      ),
      page.getByTestId("class-cancel-attendance-confirm").click(),
    ]);
    expect(cancelResponse.status(), await cancelResponse.text()).toBe(200);
    const body = await cancelResponse.json();
    expect(body.action).toBe("declined");

    // The sheet now shows the not-attending state from server data.
    await expect(page.getByTestId("class-not-attending")).toBeVisible({ timeout: 10_000 });

    // Rule 18: the occurrence was materialised and the decline recorded on it.
    const after = await dayEvents(request, coachAuth, day);
    const instance = after.find((e) => e.type === "class" && e.title === STUDENT_NAME);
    expect(instance, "the class is still on the coach's calendar").toBeTruthy();
    expect(instance!.model).toBe("LessonInstance");
    const presRes = await request.get(`${API_ROOT}/app/lesson_instance/${instance!.originalId}/presences`, { headers: coachAuth });
    expect(presRes.ok()).toBeTruthy();
    const presences = (await presRes.json()) as Array<{ status: string | null; justification: string | null }>;
    expect(presences).toHaveLength(1);
    expect(presences[0].status).toBe("absent");
    expect(presences[0].justification).toBe("justified");
  } finally {
    // Put the coach's calendar back.
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
