/**
 * PAD-371 (B-139, calendar.blocks rule 8): deleting ONE occurrence of a recurring
 * personal event from the calendar keeps every later occurrence.
 *
 * The bug: the series was shortened to the day before the occurrence and the
 * "resume from the next occurrence" copy was never created, so every later
 * occurrence vanished with the one the coach deleted.
 *
 * The series is made through the API — four Mondays, starting THIS week's Monday —
 * so the occurrence opened in the UI (next Monday) is a MIDDLE one. The delete goes
 * through the UI (event sheet → "this one"); the server's calendar is the judge.
 * Test ids and fixture titles only, never copy. Mirrors Maestro flow 93; the routes
 * are covered case by case in backend test_pad371_single_occurrence_keeps_series.py.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const TITLE = "PAD-371 Weekly Event";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** This week's Monday and the three after it. */
function mondays(): string[] {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return [0, 7, 14, 21].map((n) => iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)));
}

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

type Ev = { title: string; date: string; originalId: number };

async function events(request: APIRequestContext, auth: Record<string, string>, from: string, to: string): Promise<Ev[]> {
  const res = await request.get(`${API_APP}/calendar?from=${from}T00:00:00&to=${to}T23:59:59`, { headers: auth });
  expect(res.ok(), `calendar failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return ((Array.isArray(json) ? json : json.events ?? []) as Ev[]).filter((e) => e.title === TITLE);
}

async function removeAll(request: APIRequestContext, auth: Record<string, string>, from: string, to: string) {
  const ids = [...new Set((await events(request, auth, from, to)).map((e) => e.originalId))];
  for (const id of ids) await request.delete(`${API_APP}/calendar_block/${id}`, { headers: auth, data: {} });
}

test("PAD-371: deleting one occurrence of a weekly event keeps the later ones", async ({ page, request }) => {
  test.setTimeout(120_000);
  const auth = { Authorization: `Bearer ${await token(request)}` };
  const [first, target, third, fourth] = mondays();
  await removeAll(request, auth, first, fourth);
  try {
    const made = await request.post(`${API_APP}/add_event`, {
      headers: auth,
      data: {
        type: "personal", title: TITLE, date: first, startTime: "12:00", endTime: "13:00",
        isRecurring: true, recurrenceRule: { frequency: "weekly", daysOfWeek: [1] }, endDate: fourth,
      },
    });
    expect(made.status(), await made.text()).toBe(201);
    expect((await events(request, auth, first, fourth)).map((e) => e.date)).toEqual([first, target, third, fourth]);

    await loginAsCoach(page);
    await openCalendar(page);
    await goToNextWeek(page);
    const card = page.getByTestId("calendar-event-card").filter({ hasText: TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await page.getByTestId("event-detail-delete").click();
    const deleted = page.waitForResponse((r) => /\/api\/app\/calendar_block\/\d+$/.test(r.url()) && r.request().method() === "DELETE");
    await page.getByTestId("class-scope-single").click();
    const res = await deleted;
    expect(res.status()).toBe(204);
    expect(res.request().postDataJSON()).toEqual({ occDate: target, scope: "single" });

    // Only that Monday went; the two after it are still served.
    expect((await events(request, auth, first, fourth)).map((e) => e.date)).toEqual([first, third, fourth]);
  } finally {
    await removeAll(request, auth, first, fourth);
  }
});
