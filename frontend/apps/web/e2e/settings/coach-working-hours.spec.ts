/**
 * PAD-357 (settings.coach-working-hours): the coach's weekly working hours in
 * Settings > Calendar. Not set → the 08:00–22:00 default applies and the card
 * says so; saving writes all seven days (a day off is an empty list); a window
 * that ends before it starts is refused for that day; clearing returns to "not
 * set". Test ids and request payloads only, never copy. The coach's working
 * hours are cleared before and after.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

async function clearWorkingHours(request: APIRequestContext) {
  const login = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const json = await login.json();
  const res = await request.put(`${API_ROOT}/app/coach/working-hours`, {
    headers: { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` },
    data: { workingHours: null },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

const isPut = (r: { url(): string; request(): { method(): string } }) =>
  /\/api\/app\/coach\/working-hours$/.test(r.url()) && r.request().method() === "PUT";

test("PAD-357: a coach sets, corrects and clears their working hours", async ({ page, request }) => {
  test.setTimeout(120_000);
  await clearWorkingHours(request);
  try {
    await loginAsCoach(page);
    await page.goto("/settings?tab=calendar");
    const card = page.getByTestId("working-hours");
    await expect(card).toHaveAttribute("data-state", "default", { timeout: 15_000 });
    await expect(card.getByTestId("working-hours-default-note")).toBeVisible();

    // Sunday off, Monday 09:00–13:00; every other day keeps the default window.
    await card.getByTestId("working-hours-works-sun").click();
    await expect(card.getByTestId("working-hours-day-sun")).toHaveAttribute("data-state", "off");
    await card.getByTestId("working-hours-mon-0-start").fill("09:00");
    await card.getByTestId("working-hours-mon-0-end").fill("13:00");
    const saved = page.waitForResponse(isPut);
    await card.getByTestId("working-hours-save").click();
    const res = await saved;
    expect(res.status(), await res.text()).toBeLessThan(300);
    const { workingHours } = res.request().postDataJSON();
    expect(Object.keys(workingHours).sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
    expect(workingHours.sun).toEqual([]);
    expect(workingHours.mon).toEqual([["09:00", "13:00"]]);
    expect(workingHours.tue).toEqual([["08:00", "22:00"]]);
    await expect(card).toHaveAttribute("data-state", "set");

    // What was saved is what loads.
    await page.reload();
    await expect(card).toHaveAttribute("data-state", "set", { timeout: 15_000 });
    await expect(card.getByTestId("working-hours-mon-0-start")).toHaveValue("09:00");
    await expect(card.getByTestId("working-hours-day-sun")).toHaveAttribute("data-state", "off");

    // A Tuesday window that ends before it starts is refused, on Tuesday.
    await card.getByTestId("working-hours-tue-0-end").fill("07:00");
    const refused = page.waitForResponse(isPut);
    await card.getByTestId("working-hours-save").click();
    expect((await refused).status()).toBe(400);
    await expect(card.getByTestId("working-hours-error")).toHaveAttribute("data-day", "tue");
    await expect(card.getByTestId("working-hours-day-tue")).toHaveAttribute("data-invalid", "true");

    // Clearing returns to "not set".
    const cleared = page.waitForResponse(isPut);
    await card.getByTestId("working-hours-clear").click();
    expect((await cleared).request().postDataJSON()).toEqual({ workingHours: null });
    await expect(card).toHaveAttribute("data-state", "default");
    await expect(card.getByTestId("working-hours-default-note")).toBeVisible();
  } finally {
    await clearWorkingHours(request);
  }
});

test("PAD-361 (B-140): 'add window' on an untouched day gives a day the server accepts", async ({ page, request }) => {
  test.setTimeout(120_000);
  await clearWorkingHours(request);
  try {
    await loginAsCoach(page);
    await page.goto("/settings?tab=calendar");
    const card = page.getByTestId("working-hours");
    await expect(card).toHaveAttribute("data-state", "default", { timeout: 15_000 });

    // Monday still holds the default 08:00–22:00: there is no room after it, so
    // the day splits around the lunch break (rule 5).
    await card.getByTestId("working-hours-add-mon").click();
    await expect(card.getByTestId("working-hours-mon-0-end")).toHaveValue("13:00");
    await expect(card.getByTestId("working-hours-mon-1-start")).toHaveValue("14:00");
    await expect(card.getByTestId("working-hours-mon-1-end")).toHaveValue("22:00");

    const saved = page.waitForResponse(isPut);
    await card.getByTestId("working-hours-save").click();
    const res = await saved;
    const { workingHours } = res.request().postDataJSON();
    expect(res.status(), `sent mon=${JSON.stringify(workingHours.mon)} → ${await res.text()}`).toBeLessThan(300);
    expect(workingHours.mon).toEqual([["08:00", "13:00"], ["14:00", "22:00"]]);
    await expect(card).toHaveAttribute("data-state", "set");
  } finally {
    await clearWorkingHours(request);
  }
});
