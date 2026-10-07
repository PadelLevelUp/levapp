/**
 * PAD-526 (calendar.view rule 18; B-344): a class write re-reads the calendar. A class recurring
 * on two days of one week shows two cards. Renaming the first "this and future" must rename the
 * second card too, and deleting the first "this and future" must remove both, with no reload.
 * Before the fix the page patched only the clicked card and the other stayed stale until a refresh.
 *
 * Locators by test id (R-013). The class is made and removed through the API.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_ROOT } from "../helpers/api";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { openCalendar } from "../helpers/navigation";

const NAME = "PAD-526 twice weekly";
const RENAMED = "PAD-526 renamed";

const cards = (page: import("@playwright/test").Page, title: string) =>
  page.getByTestId("calendar-event-card").filter({ hasText: title });

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

/** Monday of the week three weeks from now (away from the seeded Monday and today's week). */
function mondayInThreeWeeks(): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 21 - ((d.getUTCDay() + 6) % 7));
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function cleanup(request: APIRequestContext, auth: Record<string, string>, from: string, to: string) {
  const feed = (await (await request.get(`${API_APP}/calendar?from=${from}T00:00:00&to=${to}T23:59:59`, { headers: auth })).json()) as Array<{ title: string; date: string }>;
  const first = feed.filter((e) => e.title === NAME || e.title === RENAMED).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (first) await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: first, scope: "future" } });
}

test("PAD-526: a 'this and future' rename and delete reach the week's other card without a reload", async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = await coachAuth(request);
  const monday = mondayInThreeWeeks();
  const wednesday = new Date(monday.getTime() + 2 * 24 * 3600 * 1000);
  const end = new Date(monday.getTime() + 20 * 24 * 3600 * 1000);
  await cleanup(request, auth, iso(monday), iso(end));
  const made = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: {
      name: NAME, classType: "academy", maxPlayers: 4, date: iso(monday), startTime: "10:00", endTime: "11:00",
      isRecurring: true, recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3] },
      recursUntilSeasonEnd: false, endDate: iso(end), playerIds: [],
    },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  try {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, NAME)).toBe(true);
    await expect(cards(page, NAME)).toHaveCount(2);
    const reloads: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) reloads.push(f.url()); });

    // Rename the Monday card "this and future".
    await cards(page, NAME).first().click();
    const sheet = page.getByRole("dialog");
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await sheet.getByTestId("class-edit-name").fill(RENAMED);
    await save.click();
    await page.getByTestId("class-scope-future").click();
    await expect(cards(page, RENAMED)).toHaveCount(2, { timeout: 15_000 });
    await expect(cards(page, NAME)).toHaveCount(0);

    // Delete the Monday card "this and future".
    await cards(page, RENAMED).first().click();
    await page.getByRole("dialog").getByTestId("class-delete").click();
    await page.getByTestId("class-scope-future").click();
    await expect(cards(page, RENAMED)).toHaveCount(0, { timeout: 15_000 });
    expect(reloads, "no page reload").toEqual([]);
  } finally {
    await cleanup(request, auth, iso(monday), iso(end));
  }
});
