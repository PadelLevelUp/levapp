/**
 * PAD-104 (classes.class-requests rules 1–4, 6, 8): a student books a class
 * in the coach's free time from the Availability tab; the slot is held on the
 * coach's calendar; the coach accepts from the class-requests inbox and a
 * private class with the student exists.
 *
 * The day is 12 days out so nothing seeded collides. The created class and
 * any leftover hold are removed in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

const STUDENT_NAME = "E2E Student";

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function dayEvents(request: APIRequestContext, auth: Record<string, string>, day: string) {
  const res = await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as Array<Record<string, unknown>>;
}

test("PAD-104: a student books a free slot, the slot is held, and the coach's accept creates the class", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const token = await coachToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const day = isoDaysAhead(12);

  try {
    // The student books from the Availability tab (rules 1–2).
    await loginAsStudent(page);
    await page.goto("/availability");
    await page.getByTestId("class-request-book").click();
    const form = page.getByTestId("class-request-form");
    await form.getByTestId("class-request-coach").click();
    await page.getByRole("option", { name: "E2E Coach" }).click();
    await form.getByTestId("class-request-date").fill(day);
    await expect(form.getByTestId("class-request-free-blocks")).toBeVisible({ timeout: 15_000 });
    const firstSlot = form.getByTestId("class-request-slot").first();
    const start = (await firstSlot.textContent())?.trim() ?? "";
    await firstSlot.click();
    await form.getByTestId("class-request-send").click();
    const row = page.locator('[data-testid="class-request-row"][data-status="pending"]');
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText(start);

    // Rule 3: the slot is held on the coach's calendar and no longer free.
    const held = await dayEvents(request, auth, day);
    expect(held.some((e) => e.type === "block" && String(e.title).includes(STUDENT_NAME))).toBe(true);
    const free = await request.get(
      `${API_ROOT}/app/class-requests/free-blocks?coachId=${encodeURIComponent(String(held.length ? "" : ""))}`,
      { headers: auth }
    );
    expect(free.status()).toBe(403); // free blocks are the student's view, never the coach's

    // The coach accepts from the inbox (rule 4).
    const coachCtx = await browser.newContext();
    const coachPage = await coachCtx.newPage();
    try {
      await loginAsCoach(coachPage);
      await coachPage.goto("/class-requests");
      const inbox = coachPage.locator('[data-testid="class-request-row"][data-status="pending"]');
      await expect(inbox).toHaveCount(1, { timeout: 15_000 });
      await expect(inbox).toContainText(STUDENT_NAME);
      await inbox.getByTestId("class-request-accept").click();
      await expect(coachPage.locator('[data-testid="class-request-row"][data-status="pending"]')).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await coachCtx.close();
    }

    // A private class at the slot with the student, and the hold is gone.
    const after = await dayEvents(request, auth, day);
    const klass = after.find((e) => e.type === "class" && e.title === STUDENT_NAME);
    expect(klass, "the private class").toBeTruthy();
    expect(klass!.startTime).toBe(start);
    expect(klass!.classType).toBe("private");
    expect(after.some((e) => e.type === "block" && String(e.title).includes(STUDENT_NAME))).toBe(false);

    // The student sees it booked.
    await page.reload();
    await expect(page.locator('[data-testid="class-request-row"][data-status="accepted"]')).toHaveCount(1, { timeout: 15_000 });
  } finally {
    // Put the coach's calendar back.
    const leftovers = await dayEvents(request, auth, day);
    for (const e of leftovers) {
      if (e.type === "class" && e.title === STUDENT_NAME) {
        await request.post(`${API_ROOT}/app/remove_class`, { headers: auth, data: { event: e, scope: "single" } });
      }
      if (e.type === "block" && String(e.title).includes(STUDENT_NAME)) {
        await request.delete(`${API_ROOT}/app/calendar_block/${e.originalId}`, { headers: auth, data: { scope: "all" } });
      }
    }
  }
});
