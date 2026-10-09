/**
 * PAD-567 (`attendance.validation` rule 26): the coach takes a mark back.
 *
 * The class is booked eight to fourteen days out (as pad570 does), so clearing arms no
 * reminder and nothing seeded is touched. The coach marks the student present, saves,
 * sees "Presente" recorded; presses "Presente" again — the row is unmarked — saves, and
 * the server row is back to the never-answered shape (`planned`, not validated).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
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

async function presenceOf(request: APIRequestContext, coachAuth: Record<string, string>, day: string) {
  const event = (await dayEvents(request, coachAuth, day)).find((e) => e.title === STUDENT_NAME);
  expect(event, "the class is on the coach's day").toBeTruthy();
  const res = await request.get(`${API_ROOT}/app/lesson_instance/${event!.originalId}/presences`, { headers: coachAuth });
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as Array<{ attendanceState: string; validated: boolean; status: string | null }>;
  return rows[0];
}

test("US-PAD-567: pressing the selected mark again returns the student to 'no answer'", async ({ page, request }) => {
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

    await loginAsCoach(page);
    await openClassDetail(page, 3);
    const row = page.getByTestId("attendance-row").first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Mark present and save: the coach's record.
    await row.getByTestId("attendance-present").click();
    await expect(row.getByTestId("attendance-present")).toHaveAttribute("aria-pressed", "true");
    await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/class_instance\/presences\/confirm(\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.getByTestId("attendance-save").click(),
    ]);
    await expect(row.getByTestId("attendance-state")).toHaveAttribute("data-state", "attended", { timeout: 10_000 });
    const marked = await presenceOf(request, coachAuth, day);
    expect(marked.status).toBe("present");
    expect(marked.validated).toBe(true);

    // Press "Presente" again: the row is unmarked — visibly, before any save.
    await row.getByTestId("attendance-present").click();
    await expect(row.getByTestId("attendance-present")).toHaveAttribute("aria-pressed", "false");
    const [cleared] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/class_instance\/presences\/confirm(\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.getByTestId("attendance-save").click(),
    ]);
    expect(cleared.status(), await cleared.text()).toBe(200);
    expect((await cleared.json()).cleared, "the server names the cleared row").toHaveLength(1);
    await expect(row.getByTestId("attendance-state")).toHaveAttribute("data-state", "planned", { timeout: 10_000 });

    // The never-answered shape, from the server, and still after a reload.
    const back = await presenceOf(request, coachAuth, day);
    expect(back.attendanceState).toBe("planned");
    expect(back.validated).toBe(false);
    expect(back.status).toBeNull();
    await page.reload();
    await openClassDetail(page, 3);
    await expect(page.getByTestId("attendance-row").first().getByTestId("attendance-state")).toHaveAttribute(
      "data-state",
      "planned",
      { timeout: 10_000 }
    );
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === STUDENT_NAME);
    await removeBlocksOnDay(request, coachAuth, day, (e) => String(e.title).includes(STUDENT_NAME));
    await deleteClassRequests(request, coachAuth, requestIds);
  }
});
