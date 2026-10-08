/**
 * PAD-515 (classes.edit rule 9; B-343): "this and all future" reaches the occurrence the coach
 * is on. The calendar loads a series occurrence while it is still virtual (`model: "Lesson"`);
 * something else then materialises it (here an edit through the API, as an auto-invite or a
 * student's answer would). The coach opens it from the calendar already on screen, adds a
 * student and saves "this and future". Before the fix the student went onto the series roster
 * only: the occurrence on screen stayed without them, and they appeared from next week on.
 *
 * Locators by test id (R-013). The class is made and removed through the API.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_APP, API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { openCalendar } from "../helpers/navigation";

const NAME = "PAD-515 weekly";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

test("PAD-515: a student added 'this and future' is on the occurrence the coach is on", async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = await coachAuth(request);
  const day = isoDay(10);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday, the calendar's convention
  const players = (await (await request.get(`${API_APP}/players`, { headers: auth })).json()) as Array<{ id: number | string; name: string; email?: string }>;
  const ana = players.find((p) => p.email === "e2e-student@test.com" || p.name === "E2E Student");
  const bruno = players.find((p) => p.email === "e2e-student-2@test.com" || p.name === "E2E Student Two");
  expect(ana && bruno, "seeded students").toBeTruthy();

  await removeClassesOnDay(request, auth, day, (e) => e.title === NAME);
  const made = await request.post(`${API_APP}/add_class`, {
    headers: auth,
    data: {
      name: NAME, classType: "academy", maxPlayers: 6, date: day, startTime: "07:00", endTime: "08:00",
      isRecurring: true, recurrenceRule: { frequency: "weekly", daysOfWeek: [weekday] },
      recursUntilSeasonEnd: false, endDate: isoDay(31), playerIds: [String(ana!.id)],
    },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  try {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, NAME)).toBe(true);

    // The calendar holds the occurrence as virtual. Now it is materialised behind its back.
    const feed = (await (await request.get(`${API_APP}/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth })).json()) as Array<{ title: string; model: string; originalId: number; date: string }>;
    const virtual = feed.find((e) => e.title === NAME);
    expect(virtual?.model).toBe("Lesson");
    const materialise = await request.post(`${API_APP}/edit_class`, {
      headers: auth,
      data: { event: { model: "Lesson", originalId: virtual!.originalId, date: day }, scope: "single", updates: { notificationsEnabled: true } },
    });
    expect(materialise.status(), await materialise.text()).toBe(201);
    const instanceId = ((await materialise.json()) as { id: number }).id;

    // The coach opens it from the calendar already on screen and adds Bruno, this and future.
    await page.getByText(NAME, { exact: true }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await page.getByTestId("player-selector-tab-all").click();
    await page.getByTestId(`player-selector-row-${bruno!.id}`).click();
    const edited = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/app/edit_class"));
    await save.click();
    // The sheet's order (ClassDetailSheet.saveEdit → commitEdit): the scope choice for a
    // recurring class, then the eligibility warning on an added student when the bar says no.
    await page.getByTestId("class-scope-future").click();
    const eligibility = page.getByTestId("eligibility-confirm-proceed");
    await Promise.race([
      eligibility.waitFor({ state: "visible", timeout: 10_000 }).then(() => eligibility.click()),
      edited,
    ]).catch(() => undefined);
    const body = (await edited).postDataJSON();
    expect(body.scope).toBe("future");
    expect(body.event.model).toBe("Lesson"); // the seam: the client still names the series
    await expect.poll(async () => {
      const read = await request.post(`${API_APP}/class_instance?model=LessonInstance&id=${instanceId}&date=${day}`, { headers: auth });
      if (!read.ok()) return `read ${read.status()}`;
      const json = (await read.json()) as { participants?: Array<{ id: number | string }> };
      return (json.participants ?? []).map((p) => String(p.id)).sort();
    }, { timeout: 15_000 }).toEqual([String(ana!.id), String(bruno!.id)].sort());
  } finally {
    // One "this and future" delete from the first occurrence removes the series.
    const left = (await (await request.get(`${API_APP}/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth })).json()) as Array<{ title: string; model: string; originalId: number; date: string }>;
    for (const e of left.filter((x) => x.title === NAME)) {
      await request.post(`${API_APP}/remove_class`, { headers: auth, data: { event: e, scope: "future" } });
    }
  }
});
