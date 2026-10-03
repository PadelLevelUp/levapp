/**
 * PAD-488 (B-264, classes.class-requests rule 19): an open calendar follows a class request's
 * transitions without a reload. Before the fix the coach's calendar kept the request's hold
 * ("pedido de aula") until a reload or a fresh login.
 *
 * Setup through the API as the seeded student: a one-off request on the seeded Monday (the
 * next Monday after today, always in NEXT week's grid) at the first free hour. The coach's
 * calendar is open on that week when the request changes somewhere else:
 *  (a) the coach accepts on another device — the hold leaves the open calendar and the class
 *      takes its place;
 *  (b) the student withdraws — the hold leaves the coach's open calendar.
 * Test ids and API fields only, never rendered copy.
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

function seededMonday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let until = (7 - ((d.getDay() + 6) % 7)) % 7;
  if (until === 0) until = 7;
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + until));
}

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const plus60 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + 60;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

type Feed = { type: string; originalId: number; model?: string; date: string; startTime: string; requestHoldOf?: number | null };

async function feed(request: APIRequestContext, auth: Record<string, string>, day: string): Promise<Feed[]> {
  const res = await request.get(`${API_APP}/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
  expect(res.ok(), `calendar failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (Array.isArray(json) ? json : json.events ?? []) as Feed[];
}

/** A pending one-off request from the seeded student at the first free hour of the seeded Monday. */
async function openRequest(request: APIRequestContext, student: Record<string, string>, day: string) {
  const coaches = await (await request.get(`${API_APP}/class-requests/coaches`, { headers: student })).json();
  const coachId = Number((coaches as { id: number | string }[])[0].id);
  const free = await (await request.get(
    `${API_APP}/class-requests/free-blocks?coachId=${coachId}&from=${day}T00:00:00&to=${day}T23:59:59`, { headers: student },
  )).json();
  const slot = (free as { date: string; startTime: string; endTime: string }[]).find(
    (b) => b.date === day && plus60(b.startTime) <= b.endTime,
  );
  expect(slot, `no free hour on ${day}: ${JSON.stringify(free)}`).toBeTruthy();
  const made = await request.post(`${API_APP}/class-requests`, {
    headers: student,
    data: { coachId, date: day, startTime: slot!.startTime, endTime: plus60(slot!.startTime) },
  });
  expect(made.status(), await made.text()).toBe(201);
  return { rid: (await made.json()).id as number, startTime: slot!.startTime };
}

const holdCards = (page: import("@playwright/test").Page) =>
  page.locator('[data-testid="calendar-event-card"][data-request-hold="true"]');

test.describe("PAD-488: an open calendar follows the request", () => {
  test("US-488: accepted on another device — the hold leaves the coach's open calendar without a reload", async ({ page, request }) => {
    test.setTimeout(150_000);
    const day = seededMonday();
    const student = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
    const coach = { Authorization: `Bearer ${await token(request, COACH_USERNAME, COACH_PASSWORD)}` };
    const { rid, startTime } = await openRequest(request, student, day);
    try {
      await loginAsCoach(page);
      await openCalendar(page);
      await goToNextWeek(page);
      await expect(holdCards(page)).toHaveCount(1, { timeout: 15_000 });

      // The coach's other device accepts. This page does nothing.
      const accepted = await request.post(`${API_APP}/class-requests/${rid}/accept`, { headers: coach, data: {} });
      expect(accepted.ok(), await accepted.text()).toBeTruthy();

      await expect(holdCards(page)).toHaveCount(0, { timeout: 15_000 });
      expect((await feed(request, coach, day)).some((e) => e.type === "class" && e.startTime === startTime)).toBe(true);
    } finally {
      for (const e of (await feed(request, coach, day)).filter((x) => x.type === "class" && x.startTime === startTime)) {
        await request.post(`${API_APP}/remove_class`, { headers: coach, data: { event: e, scope: "single" } });
      }
      await request.post(`${API_APP}/class-requests/${rid}/withdraw`, { headers: student, data: {} });
    }
  });

  test("US-488: the student withdraws — the hold leaves the coach's open calendar without a reload", async ({ page, request }) => {
    test.setTimeout(150_000);
    const day = seededMonday();
    const student = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
    const { rid } = await openRequest(request, student, day);
    try {
      await loginAsCoach(page);
      await openCalendar(page);
      await goToNextWeek(page);
      await expect(holdCards(page)).toHaveCount(1, { timeout: 15_000 });

      const withdrawn = await request.post(`${API_APP}/class-requests/${rid}/withdraw`, { headers: student, data: {} });
      expect(withdrawn.ok(), await withdrawn.text()).toBeTruthy();

      await expect(holdCards(page)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await request.post(`${API_APP}/class-requests/${rid}/withdraw`, { headers: student, data: {} });
    }
  });

  test("US-488: a refetch that lands after the week changed does not replace the new week", async ({ page, request }) => {
    test.setTimeout(150_000);
    const day = seededMonday();
    const student = { Authorization: `Bearer ${await token(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
    await loginAsCoach(page);
    await openCalendar(page);
    await expect(page.getByTestId("calendar-event-card").first()).toBeVisible({ timeout: 15_000 });

    // Arm before the trigger: the next calendar read is fetched now and delivered only on release.
    let hits = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/app\/calendar\?/, async (route) => {
      if (hits++ > 0) return route.continue();
      const stale = await route.fetch();
      await gate;
      await route.fulfill({ response: stale });
    });

    // A request event makes the open week refetch (this week's range; held above)…
    const { rid } = await openRequest(request, student, day);
    try {
      await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
      // …the coach moves to next week, which loads…
      await goToNextWeek(page);
      await expect(page.getByText("E2E Academy Class").first()).toBeVisible({ timeout: 15_000 });
      // …and then the old week's answer arrives. It must not replace next week.
      release();
      await page.waitForTimeout(1_500);
      await expect(page.getByText("E2E Academy Class").first()).toBeVisible();
    } finally {
      release();
      await request.post(`${API_APP}/class-requests/${rid}/withdraw`, { headers: student, data: {} });
    }
  });
});
