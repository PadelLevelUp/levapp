/**
 * PAD-547 — calendar.event-detail rules 19–20, notifications.waiting-list rules 18–21.
 * PAD-560 / B-421 — the picker is a search above visible rows (no select); each row says how long
 * the student is on the list (`data-scope`, payload `scope`).
 *
 * The coach sees a class's waiting list on its detail sheet, adds a roster student for this class
 * only, sees the origin and scope, and removes them. Seeded through the API; asserted by test ids,
 * `data-origin`, `data-scope` and the payload's `waitingList`, never by rendered English (PAD-320).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Class Waiting List";
const SERIES_TITLE = "E2E Waiting List Series";
type ClassRef = { model: string; originalId: number; date: string };
const created: ClassRef[] = [];
const createdSeries: ClassRef[] = [];

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: "e2e-coach", password: "E2eCoach123!" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function inDays(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.afterEach(async ({ request }) => {
  const tok = await token(request);
  while (created.length) {
    const event = created.pop()!;
    await request
      .post(`${API_APP}/remove_class`, { headers: { Authorization: `Bearer ${tok}` }, data: { event, scope: "single" } })
      .catch(() => null);
  }
  while (createdSeries.length) {
    const event = createdSeries.pop()!;
    await request
      .post(`${API_APP}/remove_class`, { headers: { Authorization: `Bearer ${tok}` }, data: { event, scope: "future" } })
      .catch(() => null);
  }
});

test("PAD-547: the coach adds a student to one class's waiting list and removes them", async ({ page, request }) => {
  const tok = await token(request);
  const rosterRes = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${tok}` } });
  const rosterBody = await rosterRes.json();
  const roster = (rosterBody.items ?? rosterBody) as Array<{ playerId: number; levelId: number | null; name: string }>;
  const enrolled = roster.find((p) => p.name === "E2E Student")!;
  const listed = roster.find((p) => p.name === "E2E Student Two")!;
  expect(enrolled && listed, "seeded students exist").toBeTruthy();

  const date = inDays(3);
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: CLASS_TITLE, classType: "academy", maxPlayers: 4, levelId: enrolled.levelId, date,
      startTime: "17:00", endTime: "18:00", playerIds: [enrolled.playerId], isRecurring: false,
      notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()}`).toBeTruthy();
  const made = await add.json();
  const ref: ClassRef = { model: made.model ?? "Lesson", originalId: made.originalId, date };
  created.push(ref);

  await loginAsCoach(page);
  await openCalendar(page);
  expect(await findClassOnCalendar(page, CLASS_TITLE)).toBe(true);
  // The card, not any text on the page (findClassOnCalendar's text match can hit elsewhere).
  await page.getByTestId("calendar-event-card").filter({ hasText: CLASS_TITLE }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

  const section = page.getByTestId("class-waiting-list");
  await section.scrollIntoViewIfNeeded();
  const toggle = page.getByTestId("class-waiting-list-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByTestId("class-waiting-list-add").click();
  await expect(page.getByTestId("class-waiting-list-dialog")).toBeVisible();
  // The enrolled student is not offered (rule 20); the offered students are visible rows (B-421).
  const dialog = page.getByTestId("class-waiting-list-dialog");
  await expect(page.getByTestId(`class-waiting-list-candidate-${enrolled.playerId}`)).toHaveCount(0);
  await expect(dialog.locator("select")).toHaveCount(0);
  // PAD-558: the search narrows the visible rows; others drop out, the searched one stays.
  await page.getByTestId("class-waiting-list-search").fill(listed.name);
  await expect(page.getByTestId(`class-waiting-list-candidate-${listed.playerId}`)).toBeVisible();
  await expect(dialog.locator('[data-testid^="class-waiting-list-candidate-"]')).toHaveCount(1);
  await page.getByTestId(`class-waiting-list-candidate-${listed.playerId}`).click();
  await expect(page.getByTestId(`class-waiting-list-candidate-${listed.playerId}`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("class-waiting-list-scope-occurrence").click();
  await page.getByTestId("class-waiting-list-confirm").click();

  const row = page.getByTestId(`class-waiting-list-row-${listed.playerId}`);
  await expect(row).toHaveAttribute("data-origin", "coach", { timeout: 10000 });
  // PAD-560 (rule 19): the row says how long the student is on the list.
  await expect(row).toHaveAttribute("data-scope", "occurrence");

  const read = async () => {
    const r = await request.post(`${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${date}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    return ((await r.json()).waitingList ?? []) as Array<{ playerId: number; origin: string; scope: string; expiresOn: string | null }>;
  };
  expect(await read()).toEqual([
    expect.objectContaining({ playerId: listed.playerId, origin: "coach", scope: "occurrence", expiresOn: null }),
  ]);

  await page.getByTestId(`class-waiting-list-remove-${listed.playerId}`).click();
  await expect(row).toHaveCount(0, { timeout: 10000 });
  expect(await read()).toEqual([]);
});

/**
 * PAD-560 — calendar.event-detail rule 20, notifications.waiting-list rules 19, 19a, 22 on web: on a
 * weekly class the coach adds a student for the whole series (asks nothing more), then moves the row
 * to a period of 2 classes (the payload's end is the next occurrence's date) and back to this class
 * only. Seeded through the API; asserted by test ids, `data-scope` and the payload, never by copy.
 */
test("PAD-560: the coach puts a student on the whole series and moves the row between scopes", async ({ page, request }) => {
  const tok = await token(request);
  const rosterRes = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${tok}` } });
  const rosterBody = await rosterRes.json();
  const roster = (rosterBody.items ?? rosterBody) as Array<{ playerId: number; levelId: number | null; name: string }>;
  const enrolled = roster.find((p) => p.name === "E2E Student")!;
  const listed = roster.find((p) => p.name === "E2E Student Two")!;
  expect(enrolled && listed, "seeded students exist").toBeTruthy();

  const date = inDays(5);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const add = await request.post(`${API_APP}/add_class`, {
    headers: { Authorization: `Bearer ${tok}` },
    data: {
      name: SERIES_TITLE, classType: "academy", maxPlayers: 4, levelId: enrolled.levelId, date,
      startTime: "17:00", endTime: "18:00", playerIds: [enrolled.playerId], isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [weekday] }, recursUntilSeasonEnd: false,
      endDate: inDays(5 + 7 * 5), notificationsEnabled: true,
    },
  });
  expect(add.ok(), `add_class: ${add.status()}`).toBeTruthy();
  const made = await add.json();
  const ref: ClassRef = { model: made.model ?? "Lesson", originalId: made.originalId, date };
  createdSeries.push(ref);

  await loginAsCoach(page);
  await openCalendar(page);
  expect(await findClassOnCalendar(page, SERIES_TITLE)).toBe(true);
  await page.getByTestId("calendar-event-card").filter({ hasText: SERIES_TITLE }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

  const section = page.getByTestId("class-waiting-list");
  await section.scrollIntoViewIfNeeded();
  const toggle = page.getByTestId("class-waiting-list-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByTestId("class-waiting-list-add").click();
  await page.getByTestId("class-waiting-list-search").fill(listed.name);
  await page.getByTestId(`class-waiting-list-candidate-${listed.playerId}`).click();
  // Rule 19: the whole series asks nothing more and says the date it runs to.
  await page.getByTestId("class-waiting-list-scope-series").click();
  await expect(page.getByTestId("class-waiting-list-series-until")).toBeVisible();
  await expect(page.getByTestId("class-waiting-list-end-date")).toHaveCount(0);
  await page.getByTestId("class-waiting-list-confirm").click();

  const row = page.getByTestId(`class-waiting-list-row-${listed.playerId}`);
  await expect(row).toHaveAttribute("data-scope", "series", { timeout: 10000 });
  await expect(row).toHaveAttribute("data-origin", "standing");

  const read = async () => {
    const r = await request.post(`${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${date}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    return ((await r.json()).waitingList ?? []) as Array<{ playerId: number; scope: string; expiresOn: string | null }>;
  };
  expect(await read()).toEqual([expect.objectContaining({ playerId: listed.playerId, scope: "series" })]);

  // Rule 22: the row's edit control moves it to a period of 2 classes — the next occurrence's date.
  await page.getByTestId(`class-waiting-list-edit-${listed.playerId}`).click();
  await expect(page.getByTestId("class-waiting-list-editing-name")).toBeVisible();
  await expect(page.getByTestId("class-waiting-list-search")).toHaveCount(0);
  await expect(page.getByTestId("class-waiting-list-scope-series")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("class-waiting-list-scope-period").click();
  await page.getByTestId("class-waiting-list-period-classes").click();
  await page.getByTestId("class-waiting-list-classes").fill("2");
  await page.getByTestId("class-waiting-list-confirm").click();
  await expect(row).toHaveAttribute("data-scope", "period", { timeout: 10000 });
  expect(await read()).toEqual([expect.objectContaining({ playerId: listed.playerId, scope: "period", expiresOn: inDays(5 + 7) })]);

  // …and back to this class only.
  await page.getByTestId(`class-waiting-list-edit-${listed.playerId}`).click();
  await page.getByTestId("class-waiting-list-scope-occurrence").click();
  await page.getByTestId("class-waiting-list-confirm").click();
  await expect(row).toHaveAttribute("data-scope", "occurrence", { timeout: 10000 });
  await expect(row).toHaveAttribute("data-origin", "coach");
  expect(await read()).toEqual([expect.objectContaining({ playerId: listed.playerId, scope: "occurrence", expiresOn: null })]);
});
