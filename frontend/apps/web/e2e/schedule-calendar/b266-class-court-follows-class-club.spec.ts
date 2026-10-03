/**
 * B-266 (clubs.courts rules 6-7): a coach at two clubs editing a class at the OLDER club is offered
 * the courts of THAT class's club, and saving one works. Before the fix the editor listed the
 * courts of the coach's newest club ("current club"), the server validated against the class's own
 * club, and every court on offer answered 400 court_not_in_club.
 *
 * Setup through the API as the seeded coach: one court on the seeded club ("E2E Club", where
 * "E2E Academy Class" sits); a second, newer club the coach creates (so it becomes their current
 * club) with a court of its own. Cleanup in `finally`: the class's court is cleared, the test court
 * deleted, and the newer club deleted through the superadmin editor (cascades its membership and
 * court) — no route removes a coach from a club. Court names are the spec's own fixtures.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS = "E2E Academy Class";
const OLD_COURT = "B266 Old-club court";
const NEW_COURT = "B266 New-club court";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

test("B-266: editing a class at the coach's older club offers that club's courts, and one saves", async ({ page, request }) => {
  test.setTimeout(150_000);
  const auth = await coachAuth(request);
  const events = await request.get(`${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`, { headers: auth });
  const academy = ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === CLASS);
  expect(academy, "seeded academy class").toBeTruthy();
  const detail = async () =>
    (await request.post(
      `${API_ROOT}/app/class_instance?model=${academy!.model}&id=${academy!.originalId}&date=${academy!.date}`,
      { headers: auth, data: {} },
    )).json();
  const oldClubId = (await detail()).clubId as number | undefined;
  expect(oldClubId, "the class detail names its club (B-266)").toBeTruthy();

  // The seeded club is the class's club; give it a court. Then a newer club with its own court.
  const coach = await (await request.get(`${API_ROOT}/app/coach`, { headers: auth })).json();
  const seededClubId = (coach.club?.id ?? coach.clubId) as number;
  expect(seededClubId, "the seeded coach has a club").toBeTruthy();
  const oldCourt = await (await request.post(`${API_ROOT}/app/club/${seededClubId}/courts`, { headers: auth, data: { name: OLD_COURT } })).json();
  const newClubRes = await request.post(`${API_ROOT}/app/club`, { headers: auth, data: { name: "B266 Newer Club" } });
  expect(newClubRes.status(), await newClubRes.text()).toBe(201);
  const newClubId = (await newClubRes.json()).id as number;
  try {
    const newCourt = await (await request.post(`${API_ROOT}/app/club/${newClubId}/courts`, { headers: auth, data: { name: NEW_COURT } })).json();
    expect(newCourt.id, "court on the newer club").toBeTruthy();
    // Sanity: the coach's current club is now the newer one; the class stays at the seeded club.
    const now = await (await request.get(`${API_ROOT}/app/coach`, { headers: auth })).json();
    expect(now.club?.id ?? now.clubId).toBe(newClubId);
    if (oldClubId !== undefined) expect(oldClubId).toBe(seededClubId);

    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS)).toBe(true);
    await page.getByText(CLASS).first().click();
    const sheet = page.getByRole("dialog");
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await expect(save).toBeVisible();

    await sheet.getByTestId("class-detail-court").click({ timeout: 15_000 });
    await expect(page.getByRole("option", { name: OLD_COURT })).toBeVisible();
    await expect(page.getByRole("option", { name: NEW_COURT })).toHaveCount(0);
    await page.getByRole("option", { name: OLD_COURT }).click();
    const saved = page.waitForResponse((r) => /\/api\/app\/edit_class/.test(r.url()));
    await save.click();
    // Accepted, not refused with court_not_in_club. (Whether a court set on ONE occurrence of a
    // materialised class persists is a separate question: LessonInstance has no court column.)
    const response = await saved;
    expect(response.status(), await response.text()).toBe(200);
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    expect(body.code).not.toBe("court_not_in_club");
  } finally {
    await request.post(`${API_ROOT}/app/edit_class`, {
      headers: auth,
      data: { event: academy, scope: "single", updates: { courtId: null } },
    });
    await request.delete(`${API_ROOT}/app/courts/${oldCourt.id}`, { headers: auth });
    const gone = await request.delete(`${API_ROOT}/editor/club/${newClubId}`, { headers: auth });
    expect.soft(gone.ok(), `delete club ${newClubId}: ${gone.status()}`).toBeTruthy();
  }
});
