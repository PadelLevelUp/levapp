/**
 * PAD-683 (`players.nickname` rule 9, B-631): with "Usar alcunha como nome principal" on, the
 * invite picker and the class detail's invitee list name the student by the coach's nickname.
 *
 * US-683a — the picker's search row reads the nickname (searched by the real name).
 * US-683b — after a manual invitation, the class detail's "Convidados" row reads the nickname.
 * A placeholder student and a class of their own, both removed after (R-040).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}

type RosterRow = { playerId: string | number; coachId: string | number; name: string };

async function rosterRow(request: APIRequestContext, coachTok: string, playerId: string): Promise<RosterRow> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const rows: RosterRow[] = Array.isArray(data) ? data : data.items;
  return rows.find((r) => String(r.playerId) === playerId)!;
}

const cleanup: Array<(request: APIRequestContext) => Promise<void>> = [];
test.afterEach(async ({ request }) => {
  for (const fn of cleanup.splice(0)) await fn(request);
});

async function setUp(request: APIRequestContext) {
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const stamp = Date.now().toString(36);
  const realName = `Jorge Silva P683 ${stamp}`;
  const nickname = `Jorge chato ${stamp}`;
  const created = await request.post(`${API_APP}/add_player`, { headers: bearer(coachTok), data: { name: realName } });
  expect(created.ok()).toBeTruthy();
  const playerId = String((await created.json()).playerId);
  const row = await rosterRow(request, coachTok, playerId);
  const edit = await request.post(`${API_APP}/edit_player`, {
    headers: bearer(coachTok),
    data: { player: { coachId: row.coachId, playerId }, updates: { nickname, nicknameAsName: true } },
  });
  expect(edit.ok(), await edit.text()).toBeTruthy();

  // Five days out: outside the reminder window (PAD-489), so nothing else answers for the student.
  const d = new Date();
  d.setDate(d.getDate() + 5);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const title = `E2E P683 ${stamp}`;
  const added = await request.post(`${API_APP}/add_class`, {
    headers: bearer(coachTok),
    data: { name: title, classType: "academy", maxPlayers: 4, date: day, startTime: "20:30", endTime: "21:30", isRecurring: false, playerIds: [] },
  });
  expect(added.ok(), await added.text()).toBeTruthy();
  const made = await added.json();
  const { removeClassesOnDay } = await import("../helpers/cleanup");
  cleanup.push(async (req) => {
    await removeClassesOnDay(req, bearer(coachTok), day, (e) => e.title === title);
    await req.post(`${API_APP}/remove_player`, { headers: bearer(coachTok), data: { coachId: row.coachId, playerId, action: "delete" } });
  });
  return { coachTok, realName, nickname, playerId, day, title, made };
}

async function openClass(page: import("@playwright/test").Page, title: string) {
  const { openCalendar } = await import("../helpers/navigation");
  const { goToNextWeek } = await import("../helpers/calendar-navigation");
  await openCalendar(page);
  const card = page.getByTestId("calendar-event-card").filter({ hasText: title }).first();
  let found = false;
  for (let week = 0; week < 2 && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, "the class is on the calendar").toBe(true);
  await card.click();
}

test("US-683a: the invite picker names the student by the coach's nickname", async ({ page, request }) => {
  test.setTimeout(150_000);
  const { realName, nickname, playerId, title } = await setUp(request);
  await loginAsCoach(page);
  await openClass(page, title);
  await page.getByTestId("class-notify-open").click();
  const dialog = page.getByTestId("notify-students-dialog");
  await expect(dialog).toBeVisible();
  // Searched by the real name, the row still reads the nickname (players.nickname rules 5, 9).
  await dialog.getByRole("textbox").fill(realName.split(" ").slice(1).join(" "));
  const rowMark = dialog.getByTestId(`notify-player-${playerId}`).first();
  await expect(rowMark).toContainText(nickname, { timeout: 15_000 });
  await expect(rowMark).not.toContainText(realName);
});

test("US-683b: the class detail's invitee row names the student by the coach's nickname", async ({ page, request }) => {
  test.setTimeout(150_000);
  const { coachTok, realName, nickname, playerId, day, title, made } = await setUp(request);
  const notify = await request.post(`${API_APP}/notify/manual`, {
    headers: bearer(coachTok),
    data: { model: made.model ?? "Lesson", originalId: made.originalId, date: day, playerIds: [playerId] },
  });
  expect(notify.ok(), `manual notify: ${notify.status()} ${await notify.text()}`).toBeTruthy();

  await loginAsCoach(page);
  await openClass(page, title);
  await page.getByTestId("class-invited-toggle").click();
  const invitee = page.getByTestId(`invitee-row-${playerId}`);
  await expect(invitee).toContainText(nickname, { timeout: 15_000 });
  await expect(invitee).not.toContainText(realName);
});
