/**
 * PAD-570 (`attendance.confirm` rules 27-28): a student may say "Vou" only once
 * asked, and "Não vou" is final.
 *
 * Replaces pad315-come-back.spec.ts (rule 26 is reversed by this ticket). The
 * class is booked eight to fourteen days out, so under the seeded coach's 48 h
 * first reminder the student has NOT been asked: the detail offers only the
 * decline, the dashboard row carries `pendingConfirmation: false`, and a "yes"
 * sent straight to the API answers `not_yet_asked`. The coach's manual reminder
 * is the ask; after it "Vou" appears and records `coming`. Then the decline:
 * the way back is gone — the hint shows, a "yes" answers `already_declined`.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { dayEvents, deleteClassRequests, removeBlocksOnDay, removeClassesOnDay } from "../helpers/cleanup";
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

/** Scan by the card, not by the title: the student's own name is also the sidebar chip. */
async function openClassDetail(page: Page, weeks: number) {
  await openCalendar(page);
  const card = page.getByTestId("calendar-event-card").filter({ hasText: STUDENT_NAME }).first();
  let found = false;
  for (let week = 0; week < weeks && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, `the class card is within ${weeks} weeks`).toBe(true);
  await card.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

type Row = {
  title: string;
  lessonInstanceId: number | null;
  pendingConfirmation: boolean;
  attendanceState?: string;
  declineTarget?: { model: string; originalId: string | number; date: string } | null;
};
async function studentRows(request: APIRequestContext, headers: Record<string, string>): Promise<Row[]> {
  const res = await request.get(`${API_ROOT}/app/dashboard`, { headers });
  expect(res.ok()).toBeTruthy();
  const blocks = ((await res.json()).blocks ?? []) as Array<{ type: string; data: { items?: Row[] } }>;
  return blocks.find((b) => b.type === "schedule_7d")?.data.items ?? [];
}

test("US-PAD-570: 'Vou' only once asked, and 'Não vou' is final", async ({ page, request }) => {
  test.setTimeout(240_000);
  const coachAuth = { Authorization: `Bearer ${await token(request, COACH_USERNAME, COACH_PASSWORD)}` };
  const studentAuth = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };

  const coachesRes = await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth });
  expect(coachesRes.ok()).toBeTruthy();
  const coaches = (await coachesRes.json()) as Array<{ id: string | number; name: string }>;
  const coach = coaches.find((c) => c.name === "E2E Coach") ?? coaches[0];
  const freeRes = await request.get(
    `${API_ROOT}/app/class-requests/free-blocks?coachId=${coach.id}&from=${isoDaysAhead(8)}&to=${isoDaysAhead(14)}`,
    { headers: studentAuth }
  );
  expect(freeRes.ok()).toBeTruthy();
  const blocks = (await freeRes.json()) as Array<{ date: string; startTime: string; endTime: string }>;
  expect(blocks.length, "a free block exists eight to fourteen days out").toBeGreaterThan(0);
  const slot = blocks[0];
  const day = slot.date;
  const requestIds: Array<string | number> = [];

  try {
    const [h, m] = slot.startTime.split(":").map(Number);
    const end = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const createRes = await request.post(`${API_ROOT}/app/class-requests`, {
      headers: studentAuth,
      data: { coachId: String(coach.id), date: day, startTime: slot.startTime, endTime: end },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const created = await createRes.json();
    requestIds.push(created.id);
    const acceptRes = await request.post(`${API_ROOT}/app/class-requests/${created.id}/accept`, { headers: coachAuth });
    expect(acceptRes.ok(), await acceptRes.text()).toBeTruthy();

    // The occurrence, as the calendar addresses it (the manual reminder needs it).
    const event = (await dayEvents(request, coachAuth, day)).find((e) => e.title === STUDENT_NAME);
    expect(event, "the accepted class is on the coach's day").toBeTruthy();
    const target = { model: event!.model, originalId: String(event!.originalId), date: day };

    // ── Rule 27, before the ask: only "Não vou", everywhere ──
    await loginAsStudent(page);
    await openClassDetail(page, 3);
    await expect(page.getByTestId("class-cancel-attendance")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("class-confirm-attendance")).toHaveCount(0);

    // The dashboard agrees with the detail (the inconsistency this ticket reports).
    const before = (await studentRows(request, studentAuth)).find((r) => r.title === STUDENT_NAME);
    expect(before, "the class is on the student's upcoming list").toBeTruthy();
    expect(before!.pendingConfirmation, "not asked yet: no Yes / No on the row").toBe(false);
    expect(before!.attendanceState).toBe("planned");

    // The server refuses an early yes even from a client that offers it. An accepted
    // request's occurrence may still be projected (no instance row, rule 20): then the
    // row carries `declineTarget` instead of an id and the refusal is pinned by
    // test_pad570_vou_after_reminder.py (`respond_reminder` needs an instance id).
    const earlyYesTarget = before!.lessonInstanceId;
    if (typeof earlyYesTarget === "number") {
      const early = await request.post(`${API_ROOT}/app/notify/respond_reminder`, {
        headers: studentAuth,
        data: { lessonInstanceId: earlyYesTarget, action: "yes" },
      });
      expect(early.status(), await early.text()).toBe(200);
      expect((await early.json()).action).toBe("not_yet_asked");
    } else {
      expect(before!.declineTarget, "a projected occurrence is declinable from the row").toBeTruthy();
    }

    // ── The coach asks by hand: now "Vou" is offered and recorded ──
    const sent = await request.post(`${API_ROOT}/app/notify/send_reminders`, { headers: coachAuth, data: target });
    expect(sent.ok(), await sent.text()).toBeTruthy();
    expect((await sent.json()).sent, "the student was asked").toBeGreaterThanOrEqual(1);

    await page.reload();
    await openClassDetail(page, 3);
    const confirm = page.getByTestId("class-confirm-attendance");
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    const [answer] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/respond_reminder(\?|$)/.test(r.url()), { timeout: 10_000 }),
      confirm.click(),
    ]);
    expect(answer.status(), await answer.text()).toBe(200);
    expect((await answer.json()).action).toBe("confirmed");
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "coming", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("class-confirm-attendance")).toHaveCount(0);
    const asked = (await studentRows(request, studentAuth)).find((r) => r.title === STUDENT_NAME);
    expect(asked!.pendingConfirmation, "answered: the row offers no Yes / No").toBe(false);
    expect(asked!.attendanceState).toBe("coming");

    // ── Rule 28: "Não vou" is final ──
    await page.getByTestId("class-cancel-attendance").click();
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.getByTestId("class-cancel-attendance-confirm").click(),
    ]);
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "not_coming", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("class-declined-hint")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("class-chat-coach")).toBeVisible();
    await expect(page.getByTestId("class-confirm-attendance")).toHaveCount(0);
    await expect(page.getByTestId("class-cancel-attendance")).toHaveCount(0);

    const after = (await studentRows(request, studentAuth)).find((r) => r.title === STUDENT_NAME);
    expect(after!.attendanceState).toBe("not_coming");
    expect(after!.pendingConfirmation).toBe(false);
    const late = await request.post(`${API_ROOT}/app/notify/respond_reminder`, {
      headers: studentAuth,
      data: { lessonInstanceId: after!.lessonInstanceId, action: "yes" },
    });
    expect(late.status(), await late.text()).toBe(200);
    expect((await late.json()).action, "no way back").toBe("already_declined");

    // Still final after a reload, from server data.
    await page.reload();
    await openClassDetail(page, 3);
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "not_coming", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("class-declined-hint")).toBeVisible();
    await expect(page.getByTestId("class-confirm-attendance")).toHaveCount(0);
  } finally {
    // PAD-341: the class needs two passes (the cancel materialised an instance
    // over a one-off lesson), and the accepted request outlives the class.
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === STUDENT_NAME);
    await removeBlocksOnDay(request, coachAuth, day, (e) => String(e.title).includes(STUDENT_NAME));
    await deleteClassRequests(request, coachAuth, requestIds);
  }
});
