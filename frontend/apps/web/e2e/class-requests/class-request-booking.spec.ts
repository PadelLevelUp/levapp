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
import { dayEvents, deleteClassRequests, removeBlocksOnDay, removeClassesOnDay } from "../helpers/cleanup";

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

test("PAD-104: a student books a free slot, the slot is held, and the coach's accept creates the class", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const token = await coachToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const day = isoDaysAhead(12);
  const requestIds: string[] = [];

  try {
    // The student books from the Availability tab (rules 1–2).
    await loginAsStudent(page);
    await page.goto("/availability");
    await page.getByTestId("class-request-book").click();
    const form = page.getByTestId("class-request-form");
    await form.getByTestId("class-request-coach").click();
    await page.getByRole("option", { name: "E2E Coach" }).click();
    // The form opens on today, whose free slots are already on screen; wait for the
    // chosen day's blocks before reading a slot, or the label comes from today's list
    // and the click lands on the re-rendered one (a daytime-only race).
    const blocksForDay = page.waitForResponse(
      (r) => r.url().includes("/class-requests/free-blocks") && r.url().includes(day),
    );
    await form.getByTestId("class-request-date").fill(day);
    await blocksForDay;
    await expect(form.getByTestId("class-request-free-blocks")).toBeVisible({ timeout: 15_000 });
    const firstSlot = form.getByTestId("class-request-slot").first();
    const start = (await firstSlot.textContent())?.trim() ?? "";
    await firstSlot.click();
    const createdResponse = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/app/class-requests"),
    );
    await form.getByTestId("class-request-send").click();
    const created = await createdResponse;
    expect(created.status(), await created.text()).toBe(201);
    const requestId = String((await created.json()).id);
    // Recorded for cleanup straight away, so a failure further down still deletes it.
    requestIds.push(requestId);
    // PAD-341: every assertion addresses THIS request by id. Counting every
    // pending or accepted row in the shared database made this test fail
    // whenever an earlier spec in its shard had booked a class of its own.
    const ownRow = `[data-testid="class-request-row"][data-request-id="${requestId}"]`;
    const row = page.locator(ownRow);
    await expect(row).toHaveAttribute("data-status", "pending", { timeout: 15_000 });
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
      const inbox = coachPage.locator(ownRow);
      await expect(inbox).toHaveAttribute("data-status", "pending", { timeout: 15_000 });
      await expect(inbox).toContainText(STUDENT_NAME);
      await inbox.getByTestId("class-request-accept").click();
      await expect(inbox).toHaveAttribute("data-status", "accepted", { timeout: 15_000 });
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
    await expect(page.locator(ownRow)).toHaveAttribute("data-status", "accepted", { timeout: 15_000 });
  } finally {
    // PAD-341: remove the class until it stops re-projecting, drop any hold, and
    // delete the request itself — removing the class leaves it `accepted`.
    await removeClassesOnDay(request, auth, day, (e) => e.title === STUDENT_NAME);
    await removeBlocksOnDay(request, auth, day, (e) => String(e.title).includes(STUDENT_NAME));
    await deleteClassRequests(request, auth, requestIds);
  }
});
