/**
 * PAD-551 (`classes.instance-enrollment` rule 13): the coach sets a regular's side for ONE
 * occurrence from the participant row; the row says "nesta aula", the server row has the
 * override, a reload keeps it, and "Habitual" clears it.
 *
 * The class is booked eight to fourteen days out through a class request (as PAD-567's spec does),
 * so nothing seeded is touched; it is removed in `finally`. By test id, never rendered copy.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { deleteClassRequests, removeBlocksOnDay, removeClassesOnDay } from "../helpers/cleanup";
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

// This spec's own class is pinned by its start time as well as its title: the seed has other
// "E2E Student" classes, and the first one on a day can be an ended, validated one.
async function openClassDetail(page: Page, weeks: number, startTime: string) {
  await openCalendar(page);
  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: STUDENT_NAME })
    .filter({ hasText: startTime })
    .first();
  let found = false;
  for (let week = 0; week < weeks && !found; week++) {
    found = await card.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
    if (!found) await goToNextWeek(page);
  }
  expect(found, `the class card is within ${weeks} weeks`).toBe(true);
  await card.click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
}

/** The server's row for `playerId` on the occurrence `lessonInstanceId`. The class is a one-off
 * the calendar serves as model "Lesson" (its id is the lesson's), so the occurrence id comes from
 * the side change's own answer, never from the calendar. */
async function presenceOf(
  request: APIRequestContext,
  coachAuth: Record<string, string>,
  lessonInstanceId: string | number,
  playerId: string
) {
  const res = await request.get(`${API_ROOT}/app/lesson_instance/${lessonInstanceId}/presences`, { headers: coachAuth });
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as Array<{ playerId: number | string; side: string | null; sideOverride: boolean; sideEditable: boolean }>;
  const row = rows.find((r) => String(r.playerId) === playerId);
  expect(row, "the player has a presence on the occurrence").toBeTruthy();
  return row!;
}

test("US-PAD-551: the coach sets a player's side for this class and clears it", async ({ page, request }) => {
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
    await openClassDetail(page, 3, slot.startTime);
    const row = page.getByTestId("attendance-row").first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    const playerId = await row.getAttribute("data-player-id");
    expect(playerId, "the row names its player").toBeTruthy();

    // The control is shown only when the server says the side is editable (sideEditable).
    await expect(row.getByTestId(`participant-side-usual-${playerId}`)).toHaveAttribute("data-state", "on");
    await expect(row.getByTestId(`participant-side-${playerId}`)).toHaveCount(0);

    // Right for this class.
    const [set] = await Promise.all([
      page.waitForResponse((r) => /\/presences\/\d+\/side$/.test(r.url()) && r.request().method() === "PUT", { timeout: 10_000 }),
      row.getByTestId(`participant-side-right-${playerId}`).click(),
    ]);
    expect(set.status(), await set.text()).toBe(200);
    const instanceId = (await set.json()).lessonInstanceId as number;
    await expect(row.getByTestId(`participant-side-${playerId}`)).toBeVisible();
    await expect(row.getByTestId(`participant-side-right-${playerId}`)).toHaveAttribute("data-state", "on");
    const after = await presenceOf(request, coachAuth, instanceId, playerId!);
    expect([after.side, after.sideOverride]).toEqual(["right", true]);

    // A reload keeps it: it is the server's.
    await page.reload();
    await openClassDetail(page, 3, slot.startTime);
    const again = page.getByTestId("attendance-row").first();
    await expect(again.getByTestId(`participant-side-${playerId}`)).toBeVisible({ timeout: 10_000 });

    // "Habitual" clears it.
    const [cleared] = await Promise.all([
      page.waitForResponse((r) => /\/presences\/\d+\/side$/.test(r.url()) && r.request().method() === "PUT", { timeout: 10_000 }),
      again.getByTestId(`participant-side-usual-${playerId}`).click(),
    ]);
    expect(cleared.status()).toBe(200);
    await expect(again.getByTestId(`participant-side-${playerId}`)).toHaveCount(0);
    expect((await presenceOf(request, coachAuth, instanceId, playerId!)).sideOverride).toBe(false);
  } finally {
    await removeClassesOnDay(request, coachAuth, day, (e) => e.title === STUDENT_NAME);
    await removeBlocksOnDay(request, coachAuth, day, (e) => String(e.title).includes(STUDENT_NAME));
    await deleteClassRequests(request, coachAuth, requestIds);
  }
});
