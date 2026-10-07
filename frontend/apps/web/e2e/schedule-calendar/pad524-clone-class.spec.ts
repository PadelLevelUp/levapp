/**
 * PAD-524 (classes.clone): "Clonar aula" opens the new-class sheet filled from the class — same
 * name, date, weekdays, end date and students — with the start empty and Create disabled until one
 * is chosen. Saving makes a new, independent series; the original is untouched.
 * Locators by test id (R-013). The classes are made and removed through the API.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_ROOT } from "../helpers/api";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { openCalendar } from "../helpers/navigation";
import { setClassTime } from "../helpers/class-time";

const NAME = "PAD-524 weekly";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

function mondayInThreeWeeks(): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 21 - ((d.getUTCDay() + 6) % 7));
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Feed = Array<{ title: string; date: string; startTime: string; model: string; originalId: number }>;

async function cleanup(request: APIRequestContext, auth: Record<string, string>, from: string, to: string) {
  for (let pass = 0; pass < 3; pass++) {
    const feed = (await (await request.get(`${API_APP}/calendar?from=${from}T00:00:00&to=${to}T23:59:59`, { headers: auth })).json()) as Feed;
    const firsts = new Map<number, Feed[number]>();
    for (const e of feed.filter((x) => x.title === NAME).sort((a, b) => a.date.localeCompare(b.date))) {
      if (!firsts.has(e.originalId)) firsts.set(e.originalId, e);
    }
    if (firsts.size === 0) return;
    for (const e of firsts.values()) await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "future" } });
  }
}

test("PAD-524: a class is cloned into a new series, with the start left to the coach", async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = await coachAuth(request);
  const monday = mondayInThreeWeeks();
  const end = new Date(monday.getTime() + 20 * 24 * 3600 * 1000);
  await cleanup(request, auth, iso(monday), iso(end));
  const made = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: {
      name: NAME, classType: "academy", maxPlayers: 4, date: iso(monday), startTime: "10:00", endTime: "11:00",
      isRecurring: true, recurrenceRule: { frequency: "weekly", daysOfWeek: [1] },
      recursUntilSeasonEnd: false, endDate: iso(end), playerIds: [],
    },
  });
  expect(made.ok(), await made.text()).toBeTruthy();
  const originalId = (await made.json()).originalId as number;

  try {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, NAME)).toBe(true);
    await page.getByTestId("calendar-event-card").filter({ hasText: NAME }).first().click();
    await page.getByRole("dialog").getByTestId("class-clone").click();

    const sheet = page.getByTestId("add-class-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("input").first()).toHaveValue(NAME);
    const start = page.getByTestId("add-class-start-time");
    await expect(start).toHaveValue("");
    await expect(page.getByTestId("add-class-create")).toBeDisabled();

    await setClassTime(start, "18:00");
    await expect(page.getByTestId("add-class-end-time")).toHaveValue("19:00");
    const created = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/app/add_class"));
    await page.getByTestId("add-class-create").click();
    const body = (await created).postDataJSON();
    expect(body).toMatchObject({
      name: NAME, date: iso(monday), startTime: "18:00", endTime: "19:00", isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1] }, endDate: iso(end),
    });

    await expect.poll(async () => {
      const feed = (await (await request.get(`${API_APP}/calendar?from=${iso(monday)}T00:00:00&to=${iso(end)}T23:59:59`, { headers: auth })).json()) as Feed;
      const mine = feed.filter((e) => e.title === NAME);
      return {
        clone: mine.filter((e) => e.startTime === "18:00" && e.originalId !== originalId).length,
        original: mine.filter((e) => e.startTime === "10:00" && e.originalId === originalId).length,
      };
    }, { timeout: 15_000 }).toEqual({ clone: 3, original: 3 });
  } finally {
    await cleanup(request, auth, iso(monday), iso(end));
  }
});
