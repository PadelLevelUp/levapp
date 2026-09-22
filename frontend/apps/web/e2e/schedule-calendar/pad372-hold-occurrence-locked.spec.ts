/**
 * PAD-372 (B-138, classes.class-requests rule 3): the live hold of an open class
 * request cannot have ONE occurrence moved or deleted — the server refuses it
 * (409 HOLD_OCCURRENCE_LOCKED) and the calendar does not offer it.
 *
 * Setup through the API as the seeded student: a weekly request on the seeded Monday
 * (the next Monday after today — always in the future, always in NEXT week's grid),
 * at the first free hour the coach's free-blocks answer offers. The coach's feed
 * then carries the hold's items with `requestHoldOf` = the request id.
 *
 * Proved here: (a) the two refused gestures answer 409 at the route and leave the
 * feed as it was; (b) in the UI the hold's card is not draggable; (c) the event sheet
 * offers no "this one / this and following" on it — Delete deletes the WHOLE block
 * (rule 3), sending no scope. Test ids and API fields only, never rendered copy.
 * Mirrors Maestro flow 96; the routes are covered case by case in backend
 * test_pad372_hold_occurrence_change_is_refused.py.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach, COACH_USERNAME, COACH_PASSWORD, STUDENT_USERNAME, STUDENT_PASSWORD,
} from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The seeded Monday (seed.py: the next Monday strictly after today) and three weeks on. */
function seededMonday(): { first: string; last: string } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let until = (7 - ((d.getDay() + 6) % 7)) % 7;
  if (until === 0) until = 7;
  const first = new Date(d.getFullYear(), d.getMonth(), d.getDate() + until);
  const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 21);
  return { first: iso(first), last: iso(last) };
}

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

type Item = { type: string; originalId: number; date: string; requestHoldOf?: number | null };

async function holdItems(request: APIRequestContext, auth: Record<string, string>, rid: number, from: string, to: string): Promise<Item[]> {
  const res = await request.get(`${API_APP}/calendar?from=${from}T00:00:00&to=${to}T23:59:59`, { headers: auth });
  expect(res.ok(), `calendar failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return ((Array.isArray(json) ? json : json.events ?? []) as Item[]).filter((e) => e.type === "block" && e.requestHoldOf === rid);
}

const plus60 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + 60;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

test("PAD-372: a live hold's occurrence cannot be moved or deleted — the server refuses, the UI does not offer it", async ({ page, request }) => {
  test.setTimeout(150_000);
  const { first, last } = seededMonday();
  const student = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
  const coach = { Authorization: `Bearer ${await token(request, COACH_USERNAME, COACH_PASSWORD)}` };

  // A free hour on the seeded Monday, from the coach the student is rostered with.
  const coaches = await (await request.get(`${API_APP}/class-requests/coaches`, { headers: student })).json();
  const coachId = Number((coaches as { id: number | string }[])[0].id);
  const free = await (await request.get(
    `${API_APP}/class-requests/free-blocks?coachId=${coachId}&from=${first}T00:00:00&to=${first}T23:59:59`, { headers: student },
  )).json();
  const slot = (free as { date: string; startTime: string; endTime: string }[]).find(
    (b) => b.date === first && plus60(b.startTime) <= b.endTime,
  );
  expect(slot, `no free hour on ${first}: ${JSON.stringify(free)}`).toBeTruthy();
  const startTime = slot!.startTime;
  const endTime = plus60(startTime);

  const made = await request.post(`${API_APP}/class-requests`, {
    headers: student,
    data: { coachId, date: first, startTime, endTime, recurrence: { weekdays: [1], startDate: first, endDate: last } },
  });
  expect(made.status(), await made.text()).toBe(201);
  const rid = (await made.json()).id as number;

  try {
    // The feed says which block is the hold, on every one of its four Mondays.
    const items = await holdItems(request, coach, rid, first, last);
    expect(items.map((e) => e.date).sort()).toHaveLength(4);
    const hold = items[0].originalId;

    // (a) The route refuses both scoped gestures and changes nothing.
    const moved = await request.post(`${API_APP}/reschedule_block/${hold}`, {
      headers: coach,
      data: { occDate: items[1].date, newDate: items[1].date, newStartTime: "15:00", newEndTime: "16:00", scope: "single" },
    });
    expect(moved.status()).toBe(409);
    expect((await moved.json()).error).toBe("HOLD_OCCURRENCE_LOCKED");
    const removed = await request.delete(`${API_APP}/calendar_block/${hold}`, {
      headers: coach, data: { occDate: items[1].date, scope: "future" },
    });
    expect(removed.status()).toBe(409);
    expect((await removed.json()).error).toBe("HOLD_OCCURRENCE_LOCKED");
    expect((await holdItems(request, coach, rid, first, last)).map((e) => e.originalId)).toEqual(items.map((e) => e.originalId));

    // (b) The card is on the grid but not draggable.
    await loginAsCoach(page);
    await openCalendar(page);
    await goToNextWeek(page);
    const card = page.locator('[data-testid="calendar-event-card"][data-request-hold="true"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute("draggable", "false");

    // (c) Delete offers no scope: the whole block goes, with no scope in the body (rule 3).
    await card.click();
    const deleted = page.waitForResponse((r) => /\/api\/app\/calendar_block\/\d+$/.test(r.url()) && r.request().method() === "DELETE");
    await page.getByTestId("event-detail-delete").click();
    await expect(page.getByTestId("class-scope-single")).toHaveCount(0);
    const res = await deleted;
    expect(res.status()).toBe(204);
    expect(res.request().postData() ?? "").not.toMatch(/scope/);
    expect(await holdItems(request, coach, rid, first, last)).toHaveLength(0);
  } finally {
    await request.post(`${API_APP}/class-requests/${rid}/withdraw`, { headers: student, data: {} });
  }
});
