/**
 * PAD-302 (classes.class-requests rule 11): the student's booking form opens
 * on the first day that still has a free block for the chosen coach, not on
 * an empty picker. Today is blocked on the coach's calendar through the API so
 * the default has to move; the block is removed in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

const BLOCK_TITLE = "PAD-302 all day";

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

test("PAD-302: the booking form opens on the first day with a free block when today is full", async ({ page, request }) => {
  const auth = await coachAuth(request);
  const today = isoDaysAhead(0);
  const created = await request.post(`${API_ROOT}/app/add_event`, {
    headers: auth,
    data: { type: "personal", title: BLOCK_TITLE, description: "", date: today, startTime: "08:00", endTime: "22:00", isRecurring: false },
  });
  expect(created.status(), await created.text()).toBeLessThan(300);

  try {
    await loginAsStudent(page);
    await page.goto("/availability");
    await page.getByTestId("class-request-book").click();
    const form = page.getByTestId("class-request-form");
    const defaulted = page.waitForResponse((r) => r.url().includes("/class-requests/free-blocks") && r.url().includes(`from=${today}T00`) && !r.url().includes(`to=${today}T`));
    await form.getByTestId("class-request-coach").click();
    await page.getByRole("option", { name: "E2E Coach" }).click();
    await defaulted;

    const dateInput = form.getByTestId("class-request-date");
    await expect.poll(async () => dateInput.inputValue()).not.toBe(today);
    const chosen = await dateInput.inputValue();
    expect(chosen > today).toBe(true);
    await expect(form.getByTestId("class-request-slot").first()).toBeVisible({ timeout: 15_000 });

    // A typed date stays the typed date.
    const typed = isoDaysAhead(20);
    await dateInput.fill(typed);
    await expect.poll(async () => dateInput.inputValue()).toBe(typed);
  } finally {
    const events = await (await request.get(`${API_ROOT}/app/calendar?from=${today}T00:00:00&to=${today}T23:59:59`, { headers: auth })).json();
    for (const e of events as Array<Record<string, unknown>>) {
      if (e.type === "block" && e.title === BLOCK_TITLE) {
        await request.delete(`${API_ROOT}/app/calendar_block/${e.originalId}`, { headers: auth, data: { scope: "all" } });
      }
    }
  }
});
