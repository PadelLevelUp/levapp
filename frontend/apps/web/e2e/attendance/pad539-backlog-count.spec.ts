/**
 * PAD-539 (attendance.validation rules 18 and 23; B-342): "X aulas por validar" is the coach's
 * whole backlog, not the week being shown. The trigger's number stays the same on a week with
 * nothing to validate, and its second line says how many fall in the shown week. The sidebar
 * badge and the count endpoint's `pendingTotal` are that same number.
 *
 * Fixture: the seed leaves every ended class with unvalidated presence rows (several weeks of
 * them). A week two weeks ahead has nothing that has run, so it is the "clean week" of the
 * report — before PAD-539 the trigger read "Nothing to validate" there.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { ui } from "../helpers/i18n";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

function firstNumber(text: string | null): number {
  return Number(((text ?? "").match(/\d+/) ?? ["0"])[0]);
}

test("PAD-539: the trigger counts the backlog on a clean week, and names the week's share", async ({ page, request }) => {
  test.setTimeout(120_000);
  const auth = await coachAuth(request);
  const badge = await (await request.get(`${API_ROOT}/app/class_instances/pending_validation/badge`, { headers: auth })).json();
  expect(badge.count).toBeGreaterThan(0);

  await loginAsCoach(page);
  await page.goto("/presences");

  const trigger = page.getByTestId("presences-validate-count");
  const weekLine = page.getByTestId("presences-validate-week");
  await expect(trigger).toContainText(/\d+/, { timeout: 15_000 });
  await expect(weekLine).not.toHaveText("…");
  // The trigger's number is the badge's number (rules 18 and 23).
  expect(firstNumber(await trigger.textContent())).toBe(badge.count);
  // The sidebar badge too.
  const sidebarBadge = page.getByTestId("nav-presences-badge");
  await expect(sidebarBadge).toHaveText(String(badge.count));

  // Two weeks ahead nothing has run: the week's share is zero, the backlog is unchanged.
  await page.getByTestId("presences-validate-trigger").click();
  const next = page.getByRole("button", { name: ui("presences.week.next") });
  await next.click();
  await expect(page.getByTestId("presences-week-label")).toContainText(/\+1/);
  const countOnCleanWeek = page.waitForResponse(
    (r) => /\/pending_validation\/count\?/.test(r.url()) && r.status() === 200
  );
  await next.click();
  await expect(page.getByTestId("presences-week-label")).toContainText(/\+2/);
  const body = await (await countOnCleanWeek).json();
  expect(body.pendingCount).toBe(0);
  // The report's face: a clean week used to read "Nothing to validate".
  await expect(weekLine).toContainText(ui("presences.validate.triggerWeekShownEmpty"));
  await expect(trigger).not.toContainText(ui("presences.validate.triggerEmpty"));
  expect(firstNumber(await trigger.textContent())).toBe(badge.count);
  expect(body.pendingTotal).toBe(badge.count);
});
