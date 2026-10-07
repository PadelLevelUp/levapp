/**
 * PAD-547 — calendar.event-detail rules 19–20, notifications.waiting-list rules 18–21.
 *
 * The coach sees a class's waiting list on its detail sheet, adds a roster student for this class
 * only, sees the origin, and removes them. Seeded through the API; asserted by test ids,
 * `data-origin` and the payload's `waitingList`, never by rendered English (PAD-320).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CLASS_TITLE = "E2E Class Waiting List";
type ClassRef = { model: string; originalId: number; date: string };
const created: ClassRef[] = [];

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
  await page.getByText(CLASS_TITLE).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

  const section = page.getByTestId("class-waiting-list");
  await section.scrollIntoViewIfNeeded();
  const toggle = page.getByTestId("class-waiting-list-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.getByTestId("class-waiting-list-add").click();
  await expect(page.getByTestId("class-waiting-list-dialog")).toBeVisible();
  // The enrolled student is not offered (rule 20).
  await expect(
    page.getByTestId("class-waiting-list-player").locator(`option[value="${enrolled.playerId}"]`),
  ).toHaveCount(0);
  await page.getByTestId("class-waiting-list-player").selectOption(String(listed.playerId));
  await page.getByTestId("class-waiting-list-scope-occurrence").click();
  await page.getByTestId("class-waiting-list-confirm").click();

  const row = page.getByTestId(`class-waiting-list-row-${listed.playerId}`);
  await expect(row).toHaveAttribute("data-origin", "coach", { timeout: 10000 });

  const read = async () => {
    const r = await request.post(`${API_APP}/class_instance?model=${ref.model}&id=${ref.originalId}&date=${date}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    return ((await r.json()).waitingList ?? []) as Array<{ playerId: number; origin: string }>;
  };
  expect(await read()).toEqual([expect.objectContaining({ playerId: listed.playerId, origin: "coach" })]);

  await page.getByTestId(`class-waiting-list-remove-${listed.playerId}`).click();
  await expect(row).toHaveCount(0, { timeout: 10000 });
  expect(await read()).toEqual([]);
});
