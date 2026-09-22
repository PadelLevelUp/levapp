/**
 * evaluations.class-panel (PAD-376): "Avaliações" on the class detail — the coach rates a
 * participant from the class and the record carries the class; a student never sees the
 * action and the endpoint refuses them; a past occurrence that was never opened offers no
 * panel and opening its detail creates nothing.
 *
 * The classes are this spec's own (one-off, named with a run stamp) and are removed after
 * each test (R-040), as are the records written through the panel.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { openCalendar } from "../helpers/navigation";
import { goToPreviousWeek } from "../helpers/calendar-navigation";

const STUDENT_NAME = "E2E Student";

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function studentPlayerId(request: APIRequestContext, coachTok: string): Promise<number> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === STUDENT_NAME);
  expect(found, `${STUDENT_NAME} is on the coach's roster`).toBeTruthy();
  return Number(found!.playerId);
}

type Made = { day: string; title: string; model: string; id: number };

/** A one-off class on `day` with E2E Student enrolled, through the coach's own add-class call. */
async function makeClass(request: APIRequestContext, coachTok: string, day: string, title: string, playerId: number): Promise<Made> {
  const res = await request.post(`${API_APP}/add_class`, {
    headers: bearer(coachTok),
    data: { name: title, classType: "academy", maxPlayers: 4, date: day, startTime: "20:30", endTime: "21:30", isRecurring: false, playerIds: [playerId] },
  });
  expect(res.ok(), `add_class ${title}: ${res.status()}`).toBeTruthy();
  const event = await res.json();
  return { day, title, model: String(event.model), id: Number(event.originalId ?? event.id) };
}

const made: Made[] = [];
const recordIds: number[] = [];

test.afterEach(async ({ request }) => {
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  for (const id of recordIds.splice(0)) await request.delete(`${API_APP}/evaluation_record/${id}`, { headers: bearer(coachTok) });
  for (const m of made.splice(0)) await removeClassesOnDay(request, bearer(coachTok), m.day, (e) => e.title === m.title);
});

/** Open the class's detail from the calendar by its card (never by the title alone: a name can also be
 *  a sidebar chip), scanning back up to `weeksBack` weeks when the class is in the past. */
async function openClassDetail(page: Page, title: string, weeksBack = 0) {
  await openCalendar(page);
  const card = page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
  let found = false;
  for (let week = 0; week <= weeksBack && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: week === weeksBack ? 15_000 : 6000 }).then(() => true, () => false);
    if (!found && week < weeksBack) await goToPreviousWeek(page);
  }
  expect(found, `the class card "${title}" is within ${weeksBack} weeks back`).toBe(true);
  await card.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

test("US-376a: the coach rates a participant from today's class; the record carries the class and shows in the player's history", async ({ page, request }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const title = `E2E Eval Class ${Date.now()}`;
  const cls = await makeClass(request, coachTok, isoDaysFromToday(0), title, playerId);
  made.push(cls);

  await loginAsCoach(page);
  await openClassDetail(page, title);
  await page.getByTestId("class-evaluations-open").click();
  await expect(page.getByTestId("class-evaluations-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("class-eval-title")).toContainText(title);

  const row = page.getByTestId(`class-eval-row-${playerId}`);
  await expect(row.getByTestId(`class-eval-summary-${playerId}`)).toHaveAttribute("data-rated", "0");
  await row.getByTestId(`class-eval-row-toggle-${playerId}`).click();
  const form = row.getByTestId("evaluation-form");
  await expect(form).toBeVisible();

  // The coach's set has the three starting competencies on the first v2 read: tap a star on the first row.
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"));
  const firstStar = form.getByTestId(/^evaluation-star-\d+-4$/).first();
  await firstStar.click();
  const response = await put;
  expect(response.status()).toBe(200);
  const record = await response.json();
  recordIds.push(record.id);
  expect(record.classInstanceId, "the record carries the class").not.toBeNull();
  expect(record.className).toBe(title);
  expect(JSON.parse(response.request().postData() ?? "{}").classRef).toMatchObject({ model: cls.model, id: cls.id });

  // The summary follows the write, on the server's read.
  await expect(row.getByTestId(`class-eval-summary-${playerId}`)).toHaveAttribute("data-rated", "1");
  await form.getByTestId("evaluation-finish").click();
  await expect(row.getByTestId("evaluation-form")).toHaveCount(0);

  // And the player's own history shows a class-linked card.
  const history = await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(coachTok) });
  expect(history.ok()).toBeTruthy();
  const records: { id: number; classInstanceId: number | null; className: string | null }[] = (await history.json()).records;
  const mine = records.find((r) => r.id === record.id);
  expect(mine?.className).toBe(title);
});

test("US-376b: a past class that was never opened offers no panel, and opening its detail creates no instance", async ({ page, request }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const day = isoDaysFromToday(-8);
  const title = `E2E Past Class ${Date.now()}`;
  const cls = await makeClass(request, coachTok, day, title, playerId);
  made.push(cls);

  // The server's own answer for that occurrence: no row, cannot be rated.
  const read = await request.post(`${API_APP}/class_instance/evaluations?model=${cls.model}&id=${cls.id}&date=${day}`, { headers: bearer(coachTok) });
  expect(read.ok()).toBeTruthy();
  const before = await read.json();
  expect(before.classInstanceId).toBeNull();
  expect(before.canRate).toBe(false);

  await loginAsCoach(page);
  await openClassDetail(page, title, 2);
  await expect(page.getByTestId("class-eval-unavailable")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("class-evaluations-open")).toBeDisabled();

  // Opening the detail materialised nothing.
  const after = await (await request.post(`${API_APP}/class_instance/evaluations?model=${cls.model}&id=${cls.id}&date=${day}`, { headers: bearer(coachTok) })).json();
  expect(after.classInstanceId).toBeNull();
  // And a write is refused rather than materialising a class that is over.
  const refused = await request.put(`${API_APP}/evaluation_record`, {
    headers: bearer(coachTok),
    data: { playerId, classRef: { model: cls.model, id: cls.id, date: day }, ratings: {} },
  });
  expect(refused.status()).toBe(409);
});

test("US-376c: a student never sees the action, and the endpoint answers 403 with no participant data", async ({ page, request }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const studentTok = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const title = `E2E Student View Class ${Date.now()}`;
  const cls = await makeClass(request, coachTok, isoDaysFromToday(0), title, playerId);
  made.push(cls);

  const refused = await request.post(`${API_APP}/class_instance/evaluations?model=${cls.model}&id=${cls.id}&date=${cls.day}`, { headers: bearer(studentTok) });
  expect(refused.status()).toBe(403);
  expect(await refused.text()).not.toContain(STUDENT_NAME);

  await loginAsStudent(page);
  await openClassDetail(page, title);
  await expect(page.getByTestId("class-evaluations-open")).toHaveCount(0);
  await expect(page.getByTestId("class-eval-unavailable")).toHaveCount(0);
});
