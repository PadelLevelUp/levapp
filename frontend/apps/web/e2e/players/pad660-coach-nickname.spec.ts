/**
 * PAD-660 (`players.nickname`): a coach's private nickname for a student.
 *
 * US-660a — the coach sets it on the profile (field, warning, switch), the profile shows it with
 * the real name under it, the roster card shows it, and the roster search finds the student by
 * it. US-660b — the student, signed in, never sees it on their own screens.
 *
 * US-660a uses a placeholder student of its own (deleted after, R-040); US-660b sets a nickname on
 * the seeded E2E Student through the coach's API and clears it after.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_APP, API_AUTH, API_ROOT } from "../helpers/api";
import { ui } from "../helpers/i18n";

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}

type RosterRow = { playerId: string | number; coachId: string | number; name: string; nickname?: string | null; displayName?: string };

async function roster(request: APIRequestContext, coachTok: string): Promise<RosterRow[]> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  return Array.isArray(data) ? data : data.items;
}

async function setNickname(request: APIRequestContext, coachTok: string, row: RosterRow, nickname: string, asName: boolean) {
  const res = await request.post(`${API_APP}/edit_player`, {
    headers: bearer(coachTok),
    data: { player: { coachId: row.coachId, playerId: row.playerId }, updates: { nickname, nicknameAsName: asName } },
  });
  expect(res.ok(), `edit_player: ${res.status()} ${await res.text()}`).toBeTruthy();
}

const cleanup: Array<(request: APIRequestContext) => Promise<void>> = [];
test.afterEach(async ({ request }) => {
  for (const fn of cleanup.splice(0)) await fn(request);
});

test("US-660a: the coach sets a nickname on the profile; the profile, the roster and the search use it", async ({ page, request }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const stamp = Date.now().toString(36);
  const realName = `Jorge Silva P660 ${stamp}`;
  const nickname = `Jorge chato ${stamp}`;
  const created = await request.post(`${API_APP}/add_player`, { headers: bearer(coachTok), data: { name: realName } });
  expect(created.ok()).toBeTruthy();
  const playerId = String((await created.json()).playerId);
  cleanup.push(async (req) => {
    const row = (await roster(req, coachTok)).find((r) => String(r.playerId) === playerId);
    if (row) await req.post(`${API_APP}/remove_player`, { headers: bearer(coachTok), data: { coachId: row.coachId, playerId, action: "delete" } });
  });

  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await page.getByRole("button", { name: ui("common.edit") }).first().click();
  await expect(page.getByTestId("player-nickname-warning")).toBeVisible();
  await page.getByTestId("player-nickname").fill(nickname);
  await page.getByTestId("player-nickname-as-name").click();
  const saved = page.waitForResponse((r) => /\/api\/app\/edit_player$/.test(r.url()) && r.request().method() === "POST");
  await page.getByRole("button", { name: ui("common.save") }).first().click();
  const body = JSON.parse((await saved).request().postData() ?? "{}");
  expect(body.updates).toMatchObject({ nickname, nicknameAsName: true });
  // The form may send the Name field as it stands; it must never carry the nickname.
  expect([undefined, realName], "the real name is never overwritten by the nickname").toContain(body.updates.name);

  // The profile: the nickname, the real name under it.
  await expect(page.getByTestId("player-real-name")).toHaveText(realName, { timeout: 10_000 });
  // The server agrees, and kept the real name.
  const row = (await roster(request, coachTok)).find((r) => String(r.playerId) === playerId)!;
  expect([row.name, row.nickname, row.displayName]).toEqual([realName, nickname, nickname]);

  // The roster card shows the nickname; the search finds it by the nickname and by the real name.
  for (const q of ["chato", "Silva P660"]) {
    const page1 = await request.get(`${API_APP}/coach_players_paginated?search=${encodeURIComponent(`${q} ${stamp}`)}`, { headers: bearer(coachTok) });
    expect((await page1.json()).items.map((r: RosterRow) => String(r.playerId)), q).toEqual([playerId]);
  }
  await page.goto("/players");
  // The roster is paginated: search it by the nickname, as the coach would.
  await page.getByTestId("players-search-input").fill(`chato ${stamp}`);
  await expect(page.getByTestId(`player-card-name-${playerId}`).first()).toHaveText(nickname, { timeout: 15_000 });
});

async function pageText(page: Page, path: string): Promise<string> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page.locator("body").innerText();
}

test("US-660b: the student never sees the nickname their coach gave them", async ({ page, request }) => {
  test.setTimeout(150_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const row = (await roster(request, coachTok)).find((r) => r.name === "E2E Student")!;
  expect(row, "E2E Student is on the coach's roster").toBeTruthy();
  const nickname = `Alcunha secreta ${Date.now().toString(36)}`;
  await setNickname(request, coachTok, row, nickname, true);
  cleanup.push((req) => setNickname(req, coachTok, row, "", false));

  // Every payload the student reads, as JSON.
  const studentTok = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  for (const path of ["/auth/me", "/app/conversations", "/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59"]) {
    const res = await request.get(`${API_ROOT}${path}`, { headers: bearer(studentTok) });
    expect(res.ok(), path).toBeTruthy();
    expect(await res.text(), path).not.toContain(nickname);
  }

  // And their screens.
  await loginAsStudent(page);
  for (const path of ["/dashboard", "/calendar", "/messages", "/settings"]) {
    expect(await pageText(page, path), path).not.toContain(nickname);
  }
});
