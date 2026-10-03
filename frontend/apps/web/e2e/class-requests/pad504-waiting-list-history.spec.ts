/**
 * PAD-504 (classes.academy-class-booking rule 11): the student's Availability request history shows
 * their waiting-list place on a full academy class, with its state, and lets them leave it from
 * there (one inline confirmation); the row then reads "no longer on the waiting list".
 *
 * Setup is the spec's own (R-040), as in pad358-academy-class-booking: the coach's open-spots
 * toggle is turned on and a full class is created through the API; the student joins its waiting
 * list through the API. Everything is put back in `finally`. Assertions use test ids and state
 * attributes, never copy (B-103).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";

const FULL_CLASS = "E2E PAD-504 Full Class";

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

test("PAD-504: a waiting-list place is in the student's request history and can be left from there", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const coachAuth = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const studentAuth = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(4);

  const configRes = await request.get(`${API_ROOT}/app/notify/config`, { headers: coachAuth });
  const savedVisible = Boolean((await configRes.json()).openSpotsVisible);
  const coach = ((await (await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: studentAuth })).json()) as Array<{
    id: string;
    name: string;
  }>).find((c) => c.name === "E2E Coach");
  expect(coach, "the student is rostered with the seeded coach").toBeTruthy();
  const filler = ((await (await request.get(`${API_ROOT}/app/coach_players`, { headers: coachAuth })).json()) as Array<{
    playerId: number;
    name: string;
  }>).find((p) => p.name.startsWith("Filler Player"));
  expect(filler, "a filler player to take the full class's only spot").toBeTruthy();

  try {
    expect((await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: true } })).ok()).toBeTruthy();
    const added = await request.post(`${API_ROOT}/app/add_class`, {
      headers: coachAuth,
      data: {
        name: FULL_CLASS, date: day, maxPlayers: 1, playerIds: [filler!.playerId],
        classType: "academy", startTime: "18:00", endTime: "19:00", isRecurring: false, notificationsEnabled: false,
      },
    });
    expect(added.ok(), await added.text()).toBeTruthy();

    const listed = (await (await request.get(`${API_ROOT}/app/academy-classes?coachId=${coach!.id}`, { headers: studentAuth })).json())
      .classes as Array<{ title: string; model: string; originalId: string | number; date: string }>;
    const full = listed.find((c) => c.title === FULL_CLASS);
    expect(full, "the full class is listed to the student").toBeTruthy();
    const joined = await request.post(`${API_ROOT}/app/class-waiting-list`, {
      headers: studentAuth,
      data: { model: full!.model, originalId: full!.originalId, date: full!.date },
    });
    expect(joined.status(), await joined.text()).toBe(201);
    const { lessonInstanceId } = await joined.json();

    await loginAsStudent(page);
    await page.goto("/availability");
    const row = page.locator(`[data-testid="class-waiting-list-row"][data-instance-id="${lessonInstanceId}"]`);
    await expect(row).toHaveAttribute("data-status", "active", { timeout: 15_000 });
    await expect(row).toContainText(FULL_CLASS);

    await row.getByTestId("class-waiting-list-leave").click();
    await expect(row.getByTestId("class-waiting-list-leave-confirm")).toBeVisible();
    const [left] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/app/class-waiting-list/${lessonInstanceId}/leave`)),
      row.getByTestId("class-waiting-list-leave-yes").click(),
    ]);
    expect(left.status()).toBe(200);

    // The row is now history: open the toggle and find it there as `left`.
    const toggle = page.getByTestId("class-requests-history-toggle");
    await toggle.click();
    const after = page.locator(`[data-testid="class-waiting-list-row"][data-instance-id="${lessonInstanceId}"]`);
    await expect(after).toHaveAttribute("data-status", "left", { timeout: 10_000 });
    await expect(after.getByTestId("class-waiting-list-leave")).toHaveCount(0);

    const server = (await (await request.get(`${API_ROOT}/app/class-waiting-list`, { headers: studentAuth })).json()) as Array<{
      lessonInstanceId: number;
      status: string;
    }>;
    expect(server.find((r) => r.lessonInstanceId === lessonInstanceId)?.status).toBe("left");
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === FULL_CLASS);
    await request.post(`${API_ROOT}/app/notify/config`, { headers: coachAuth, data: { openSpotsVisible: savedVisible } });
  }
});
