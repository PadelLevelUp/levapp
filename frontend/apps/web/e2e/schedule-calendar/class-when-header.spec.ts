import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_APP, API_ROOT } from "../helpers/api";

/**
 * calendar.event-detail rule 28 (UI idea 6) — reading a class starts with when it is. A class made through the
 * API with a level, a club, a court and free seats, read at 320px and 1280px as the coach and as an enrolled
 * student: the time is on one line inside the sheet, the capacity line and the place keep their ids and the text
 * they show today, the coach's facts name the level, and the student sees no level and no bar.
 */
const NAME = "PAD-UI6 header class";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

/** A Monday three weeks out: far from the seeded classes, inside the week the calendar can reach by paging. */
function inThreeWeeks(): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 21);
  return d.toISOString().slice(0, 10);
}

/** The deep link opens the class's sheet on its own day, at any width (dashboard.navigation rule 8). */
async function openClass(page: Page, id: string, date: string) {
  await page.goto(`/calendar?classId=${encodeURIComponent(id)}&date=${date}`);
  await expect(page.getByTestId("class-detail-when")).toBeVisible({ timeout: 15_000 });
}

test("[CALENDAR-EVENT-DETAIL-46] the header fits at 320px and keeps its ids", async ({ page, request }) => {
  test.setTimeout(240_000);
  const auth = await coachAuth(request);
  const date = inThreeWeeks();
  const feed = async () =>
    (await (await request.get(`${API_APP}/calendar?from=${date}T00:00:00&to=${date}T23:59:59`, { headers: auth })).json()) as Array<{ title: string; id: string }>;
  for (const e of (await feed()).filter((x) => x.title === NAME)) {
    await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "single" } });
  }

  // A club with a court, a level, the seeded student enrolled, seats left.
  const me = (await (await request.get(`${API_APP}/coach`, { headers: auth })).json()) as { club: { id: number; name: string } };
  const court = await request.post(`${API_APP}/club/${me.club.id}/courts`, { headers: auth, data: { name: "Campo UI6" } });
  expect(court.status()).toBe(201);
  const courtId = ((await court.json()) as { id: number }).id;
  const levels = (await (await request.get(`${API_APP}/coach_levels`, { headers: auth })).json()) as Array<{ id: number; code: string }>;
  expect(levels.length, "the seeded coach has levels").toBeGreaterThan(0);
  const players = (await (await request.get(`${API_APP}/coach_players`, { headers: auth })).json()) as Array<{ playerId: number; name: string }>;
  const student = players.find((p) => p.name === "E2E Student");
  expect(student, "the seeded student is on the coach's roster").toBeTruthy();
  const made = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: {
      name: NAME, classType: "academy", maxPlayers: 6, date, startTime: "10:30", endTime: "12:00",
      isRecurring: false, levelId: levels[0].id, courtId, playerIds: [student!.playerId], notificationsEnabled: false,
    },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  const text = async (page: Page, id: string) => ((await page.getByTestId(id).textContent()) ?? "").replace(/\s+/g, " ").trim();
  /** The time stays on one line and inside the sheet. */
  const timeFits = async (page: Page) => {
    const time = page.getByTestId("class-detail-time");
    const [box, lineHeight, sheet] = await Promise.all([
      time.boundingBox(),
      time.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight)),
      page.getByRole("dialog").boundingBox(),
    ]);
    expect(box!.height, "one line").toBeLessThanOrEqual(lineHeight * 1.5);
    expect(box!.x + box!.width, "inside the sheet").toBeLessThanOrEqual(sheet!.x + sheet!.width);
    expect(await time.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  };

  try {
    for (const width of [320, 1280]) {
      // The coach: tile, time, until-less one-off, the facts line names the level and the place.
      await page.setViewportSize({ width, height: 900 });
      await loginAsCoach(page);
      await openClass(page, (await feed()).find((x) => x.title === NAME)!.id, date);
      await timeFits(page);
      await expect(page.getByTestId("class-detail-time")).toHaveText("10:30 – 12:00");
      await expect(page.getByTestId("class-detail-date-tile")).toBeVisible();
      await expect(page.getByTestId("class-detail-facts")).toContainText(levels[0].code);
      expect(await text(page, "class-detail-place")).toContain(`${me.club.name} · Campo UI6`);
      // The capacity keeps its id and its text: 1 of 6, 5 open spots, and the coach's bar.
      expect(await text(page, "class-detail-capacity")).toContain("1/6");
      await expect(page.getByTestId("class-detail-capacity").getByTestId("class-fill-bar")).toBeVisible();
      // Editing is the five boxes again, and the header block is gone.
      await page.getByTestId("class-edit").click();
      await expect(page.getByTestId("class-detail-when")).toHaveCount(0);
      await expect(page.getByTestId("class-detail-start-time")).toBeVisible();
      await expect(page.getByTestId("class-detail-capacity")).toBeVisible();
      await page.keyboard.press("Escape");

      // The enrolled student: the place only, no level, no bar; the capacity line keeps its id and text.
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await loginAsStudent(page);
      await openClass(page, (await feed()).find((x) => x.title === NAME)!.id, date);
      await timeFits(page);
      expect(await text(page, "class-detail-place")).toContain(`${me.club.name} · Campo UI6`);
      await expect(page.getByTestId("class-detail-level")).toHaveCount(0);
      expect(await text(page, "class-detail-capacity")).toContain("/6");
      await expect(page.getByTestId("class-detail-capacity").getByTestId("class-fill-bar")).toHaveCount(0);
    }
  } finally {
    for (const e of (await feed()).filter((x) => x.title === NAME)) {
      await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "single" } });
    }
    await request.delete(`${API_APP}/courts/${courtId}`, { headers: auth });
  }
});
