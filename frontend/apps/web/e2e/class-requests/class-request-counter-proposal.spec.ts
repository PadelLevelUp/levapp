/**
 * PAD-281 / B-077 (classes.class-requests rules 5, 6, 10): the coach's
 * counter-proposal is answerable where it is announced, and the student can
 * send another time back — the loop continues until someone accepts.
 *
 * The request is created and the coach's moves are made through the API; the
 * student's side is walked in the browser: the chat bubble's actions, the
 * Availability picker it opens, and the final accept from a second proposal.
 * The day is 13 days out so nothing seeded (or PAD-104's spec, 12 days out)
 * collides. The created class and any leftover hold are removed in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

const STUDENT_NAME = "E2E Student";

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function tokenFor(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

async function dayEvents(request: APIRequestContext, auth: Record<string, string>, day: string) {
  const res = await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Array<Record<string, unknown>>;
}

test("PAD-281: the student answers the coach's proposal from chat, proposes another time, and the loop closes on accept", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const coach = await tokenFor(request, COACH_USERNAME, COACH_PASSWORD);
  const student = await tokenFor(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const day = isoDaysAhead(13);

  try {
    // The student's request and the coach's first proposal (rules 2, 4) — over the API.
    const coachRow = (await (await request.get(`${API_ROOT}/app/class-requests/coaches`, { headers: student })).json()) as Array<{ id: string; name: string }>;
    const coachId = coachRow.find((c) => c.name === "E2E Coach")?.id ?? coachRow[0].id;
    const created = await request.post(`${API_ROOT}/app/class-requests`, {
      headers: student,
      data: { coachId, date: day, startTime: "10:00", endTime: "11:00" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const requestId = (await created.json()).id as number;
    const proposed = await request.post(`${API_ROOT}/app/class-requests/${requestId}/propose`, {
      headers: coach,
      data: { date: day, startTime: "15:00", endTime: "16:00" },
    });
    expect(proposed.status(), await proposed.text()).toBe(200);

    // Rule 6: the proposal is answerable in chat.
    await loginAsStudent(page);
    await page.goto("/messages");
    await page.getByText("E2E Coach").first().click();
    const actions = page.locator(`[data-testid="class-request-proposal-actions"][data-request-id="${requestId}"]`);
    await expect(actions).toHaveAttribute("data-state", "actions", { timeout: 15_000 });
    await expect(actions.getByTestId("class-request-bubble-accept")).toBeVisible();
    await expect(actions.getByTestId("class-request-bubble-decline")).toBeVisible();

    // Rule 10: "propose another time" lands on the Availability picker for this request.
    await actions.getByTestId("class-request-bubble-propose").click();
    await expect(page).toHaveURL(/\/availability/);
    const row = page.locator(`[data-testid="class-request-row"][data-request-id="${requestId}"]`);
    await expect(row).toHaveAttribute("data-status", "countered", { timeout: 15_000 });
    const form = row.getByTestId("class-request-counter-form");
    await expect(form).toBeVisible();
    // The request's own hold (15:00–16:00) is not busy time: 15:00 is offered again.
    await expect(form.getByTestId("class-request-counter-slot").filter({ hasText: "15:00" })).toHaveCount(1, { timeout: 15_000 });
    await form.getByTestId("class-request-counter-slot").filter({ hasText: "17:00" }).click();
    await form.getByTestId("class-request-counter-send").click();
    await expect(row).toHaveAttribute("data-status", "pending", { timeout: 15_000 });
    await expect(row).toContainText("17:00");

    // The hold moved with the slot, and the coach sees a pending request at 17:00.
    const held = await dayEvents(request, coach, day);
    const hold = held.find((e) => e.type === "block" && String(e.title).includes(STUDENT_NAME));
    expect(hold?.startTime).toBe("17:00");
    const inbox = (await (await request.get(`${API_ROOT}/app/class-requests`, { headers: coach })).json()) as Array<{ id: number; status: string; startTime: string }>;
    expect(inbox.find((r) => r.id === requestId)).toMatchObject({ status: "pending", startTime: "17:00" });

    // Round two: the coach proposes again. Three bubbles now name the request — the
    // coach's first proposal, the student's counter-proposal and the new proposal —
    // and only the last one is answerable.
    const again = await request.post(`${API_ROOT}/app/class-requests/${requestId}/propose`, {
      headers: coach,
      data: { date: day, startTime: "19:00", endTime: "20:00" },
    });
    expect(again.status(), await again.text()).toBe(200);
    await page.goto("/messages");
    await page.getByText("E2E Coach").first().click();
    const bubbles = page.locator(`[data-testid="class-request-proposal-actions"][data-request-id="${requestId}"]`);
    await expect(bubbles).toHaveCount(3, { timeout: 15_000 });
    await expect(bubbles.nth(0)).toHaveAttribute("data-state", "superseded");
    await expect(bubbles.nth(1)).toHaveAttribute("data-state", "superseded");
    await expect(bubbles.last()).toHaveAttribute("data-state", "actions");

    // Rule 5: accept from the bubble — the class exists at 19:00 and the bubble says so.
    await bubbles.last().getByTestId("class-request-bubble-accept").click();
    await expect(bubbles.last()).toHaveAttribute("data-state", "outcome", { timeout: 15_000 });
    await expect(bubbles.last()).toContainText(/Aula marcada|Class booked/);
    const after = await dayEvents(request, coach, day);
    const klass = after.find((e) => e.type === "class" && e.title === STUDENT_NAME);
    expect(klass, "the private class").toBeTruthy();
    expect(klass!.startTime).toBe("19:00");
    expect(after.some((e) => e.type === "block" && String(e.title).includes(STUDENT_NAME))).toBe(false);
  } finally {
    const leftovers = await dayEvents(request, coach, day);
    for (const e of leftovers) {
      if (e.type === "class" && e.title === STUDENT_NAME) {
        await request.post(`${API_ROOT}/app/remove_class`, { headers: coach, data: { event: e, scope: "single" } });
      }
      if (e.type === "block" && String(e.title).includes(STUDENT_NAME)) {
        await request.delete(`${API_ROOT}/app/calendar_block/${e.originalId}`, { headers: coach, data: { scope: "all" } });
      }
    }
  }
});
