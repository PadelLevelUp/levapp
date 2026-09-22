/**
 * PAD-377 (B-150, calendar.blocks rule 10): a weekly personal event edited to a
 * one-off stops repeating.
 *
 * The bug: the edit answered `isRecurring: false` but the old recurrence rule stayed
 * on the row (the form layer drops the empty value), so the calendar went on serving
 * the event every week — and, for a student's unavailability, the invitation engine
 * went on skipping them every week.
 *
 * The series is made through the API (four Mondays from this week's); the edit goes
 * through the UI (event sheet → edit → repeat off → save); the server's calendar is
 * the judge. Test ids and fixture titles only, never copy. Mirrors Maestro flow 94;
 * both edit routes are covered in backend test_pad377_one_off_edit_ends_the_series.py.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { goToNextWeek } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const TITLE = "PAD-377 Weekly Event";

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

test("PAD-377: a weekly event edited to a one-off stops repeating", async ({ page, request }) => {
  test.setTimeout(120_000);
  const auth = { Authorization: `Bearer ${await token(request)}` };
  const [first, , , fourth] = mondays();
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
    expect(await events(request, auth, first, fourth)).toHaveLength(4);

    await loginAsCoach(page);
    await openCalendar(page);
    await goToNextWeek(page);
    const card = page.getByTestId("calendar-event-card").filter({ hasText: TITLE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await page.getByTestId("event-detail-edit").click();
    const repeat = page.getByTestId("event-detail-recurring-switch");
    await expect(repeat).toHaveAttribute("aria-checked", "true");
    await repeat.click();
    await expect(repeat).toHaveAttribute("aria-checked", "false");
    const saved = page.waitForResponse((r) => /\/api\/app\/calendar_block\/\d+$/.test(r.url()) && r.request().method() === "PUT");
    await page.getByTestId("event-detail-save").click();
    const res = await saved;
    expect(res.status(), await res.text()).toBeLessThan(300);
    expect(res.request().postDataJSON().isRecurring).toBe(false);
    expect((await res.json()).isRecurring).toBe(false);

    // What the response says and what the calendar serves now agree: one day, not four.
    expect(await events(request, auth, first, fourth)).toHaveLength(1);
  } finally {
    await removeAll(request, auth, first, fourth);
  }
});
