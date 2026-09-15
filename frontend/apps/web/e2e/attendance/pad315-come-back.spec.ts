/**
 * PAD-315 (`attendance.confirm` rule 26): a student who said they are not
 * coming can say they can come after all, and gets their spot back while it is
 * still free.
 *
 * The refusal half (`spot_filled`) is pinned by unit tests in
 * `@levelup/config` rather than here: making it happen end to end means filling
 * the class from another account between two taps, which is a race this spec
 * would have to win rather than assert. What this spec proves is the half a
 * unit test cannot — that the affordance appears on the real screen for a real
 * declined student, calls the real endpoint, and that the row comes back as
 * `coming` from server data after a reload.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent } from "../helpers/auth";
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

test("US-PAD-315: a student who said they are not coming can come back while the spot is free", async ({
  page,
  request,
}) => {
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

    // Decline through the UI, which is the state this ticket starts from.
    await loginAsStudent(page);
    await openClassDetail(page, 3);
    await page.getByTestId("class-cancel-attendance").click();
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/cancel_attendance(\?|$)/.test(r.url()), { timeout: 10_000 }),
      page.getByTestId("class-cancel-attendance-confirm").click(),
    ]);
    const declined = page.getByTestId("attendance-state").first();
    await expect(declined).toHaveAttribute("data-state", "not_coming", { timeout: 10_000 });

    // Rule 26: the way back is offered on that state — and offered without the
    // client having asked anything about capacity.
    const comeBack = page.getByTestId("class-come-back");
    await expect(comeBack).toBeVisible({ timeout: 10_000 });

    const [answer] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/respond_reminder(\?|$)/.test(r.url()), { timeout: 10_000 }),
      comeBack.click(),
    ]);
    expect(answer.status(), await answer.text()).toBe(200);
    expect((await answer.json()).action, "the spot was free, so the server re-seats them").toBe("confirmed");

    // The row reports the server's answer, and still does after a reload.
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "coming", {
      timeout: 10_000,
    });
    await page.reload();
    await openClassDetail(page, 3);
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "coming", {
      timeout: 10_000,
    });
    // Having come back, they can say they are not coming again — the edge goes both ways.
    await expect(page.getByTestId("class-cancel-attendance")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("class-come-back")).toHaveCount(0);
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
