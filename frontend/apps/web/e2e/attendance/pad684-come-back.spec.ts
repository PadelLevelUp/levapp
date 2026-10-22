/**
 * PAD-684 (`attendance.confirm` rule 28): "Afinal vou". A student who said "Não vou" to a class
 * that has not started sees what the SERVER says (`comeBack`): with a spot, "Afinal vou" puts them
 * back on `coming`; without one, the spot-taken line and the occurrence's waiting list.
 *
 * Seeded through the API (the class five days out, the "Não vou", and in the second test another
 * student taking the freed place); asserted by test ids and `data-state`, never by rendered copy.
 * Cleanup per R-040: the class (by title) and the join request this spec created.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";

const TITLE_REJOIN = "E2E 684 Come Back";
const TITLE_FULL = "E2E 684 Come Back Full";
const DAYS_AHEAD = 5;

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function bearer(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
}

function card(page: Page, title: string) {
  return page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
}

async function openClassDetail(page: Page, title: string) {
  await openCalendar(page);
  let found = false;
  for (let week = 0; week < 2 && !found; week++) {
    found = await card(page, title).waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, "the class card is within two weeks").toBe(true);
  await card(page, title).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/** The class on the coach's day, as the calendar addresses it. */
async function createClassWithStudent(
  request: APIRequestContext,
  coachAuth: Record<string, string>,
  title: string,
  day: string,
  extraName?: string
) {
  const rosterRes = await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth });
  expect(rosterRes.ok()).toBeTruthy();
  const body = await rosterRes.json();
  const roster = (body.items ?? body) as Array<{ playerId: number; name: string }>;
  const student = roster.find((p) => p.name === "E2E Student");
  expect(student, "the seeded student is on the roster").toBeTruthy();
  const extra = extraName ? roster.find((p) => p.name === extraName) : undefined;
  if (extraName) expect(extra, `${extraName} is on the roster`).toBeTruthy();
  const add = await request.post(`${API_ROOT}/app/add_class`, {
    headers: coachAuth,
    data: {
      name: title, classType: "academy", maxPlayers: extra ? 2 : 1, date: day, startTime: "19:00", endTime: "20:00",
      isRecurring: false, notificationsEnabled: false,
      playerIds: extra ? [student!.playerId, extra.playerId] : [student!.playerId],
    },
  });
  expect(add.ok(), `add_class: ${add.status()} ${await add.text()}`).toBeTruthy();
  const events = (await (await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: coachAuth })).json()) as Array<{
    title: string; model: string; originalId: number | string; date: string;
  }>;
  const event = events.find((e) => e.title === title);
  expect(event, "the class is on the coach's day").toBeTruthy();
  return event!;
}

async function sayNoByApi(
  request: APIRequestContext,
  studentAuth: Record<string, string>,
  event: { model: string; originalId: number | string; date: string }
) {
  const res = await request.post(`${API_ROOT}/app/notify/cancel_attendance`, {
    headers: studentAuth,
    data: { model: event.model, originalId: String(event.originalId), date: event.date },
  });
  expect(res.ok(), `cancel_attendance: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("US-PAD-684: with a spot, 'Afinal vou' puts the student back on coming", async ({ page, request }) => {
  test.setTimeout(180_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(DAYS_AHEAD);
  try {
    const event = await createClassWithStudent(request, coachAuth, TITLE_REJOIN, day);
    await sayNoByApi(request, studentAuth, event);

    await loginAsStudent(page);
    await openClassDetail(page, TITLE_REJOIN);
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "not_coming", { timeout: 10_000 });
    const comeBack = page.getByTestId("attendance-come-back");
    await expect(comeBack).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("class-declined-hint")).toHaveCount(0);

    const [answer] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/notify\/respond_reminder(\?|$)/.test(r.url()), { timeout: 10_000 }),
      comeBack.click(),
    ]);
    expect(answer.status(), await answer.text()).toBe(200);
    expect((await answer.json()).action).toBe("confirmed");
    await expect(page.getByTestId("attendance-state").first()).toHaveAttribute("data-state", "coming", { timeout: 10_000 });
    await expect(page.getByTestId("attendance-come-back")).toHaveCount(0);
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === TITLE_REJOIN);
  }
});

test("US-PAD-684: with no spot left, the student sees it and joins the occurrence's waiting list", async ({ page, request }) => {
  test.setTimeout(180_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(DAYS_AHEAD);
  try {
    // Two places, two students; E2E Student says "Não vou" and the coach then takes the class down
    // to one place, so the one left holds it and there is no spot to come back to.
    const event = await createClassWithStudent(request, coachAuth, TITLE_FULL, day, "Filler Player 02");
    await sayNoByApi(request, studentAuth, event);
    const shrunk = await request.post(`${API_ROOT}/app/edit_class`, {
      headers: coachAuth,
      data: { event: { model: event.model, originalId: event.originalId, date: event.date }, scope: "single", updates: { maxPlayers: 1 } },
    });
    expect(shrunk.ok(), `edit_class: ${shrunk.status()} ${await shrunk.text()}`).toBeTruthy();

    await loginAsStudent(page);
    await openClassDetail(page, TITLE_FULL);
    await expect(page.getByTestId("attendance-come-back-spot-taken")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("attendance-come-back")).toHaveCount(0);
    const join = page.getByTestId("attendance-come-back-waiting-list");
    await expect(join).toBeVisible();

    const [placed] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/class-waiting-list(\?|$)/.test(r.url()) && r.request().method() === "POST", { timeout: 10_000 }),
      join.click(),
    ]);
    expect(placed.status(), await placed.text()).toBeLessThan(300);
    expect((await placed.json()).onWaitingList).toBe(true);
    await expect(page.getByTestId("attendance-come-back-on-waiting-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("attendance-come-back-waiting-list")).toHaveCount(0);
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === TITLE_FULL);
  }
});
