/**
 * PAD-129 (eligibility.cascade rules 1–2, 5, 7–9): a coach opens one class to
 * everyone inside a restricted standard bar, from the class sheet.
 *
 * Seed facts: the coach's ladder is I1 → B1; "E2E Academy Class" is B1 and not
 * recurring (so a save has no scope dialog and writes the instance tier); the
 * filler players are I1, so with a `same_as_class` standard bar they fail it.
 * The bar and the override are both restored in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS = "E2E Academy Class";
const STRONGER_STUDENT = "Filler Player 01";

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function academyEvent(request: APIRequestContext, token: string) {
  const events = await request.get(
    `${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const academy = ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === CLASS);
  expect(academy, "seeded academy class").toBeTruthy();
  return academy!;
}

async function ineligibleFor(request: APIRequestContext, token: string, academy: Record<string, unknown>) {
  const players = await request.get(`${API_ROOT}/app/coach_players`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const filler = ((await players.json()) as Array<{ playerId: number | string; name: string }>).find(
    (p) => p.name === STRONGER_STUDENT
  );
  expect(filler, "seeded filler player").toBeTruthy();
  const check = await request.post(`${API_ROOT}/app/notify/eligibility_check`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { model: academy.model, originalId: academy.originalId, date: academy.date, playerIds: [String(filler!.playerId)] },
  });
  expect(check.ok()).toBeTruthy();
  return ((await check.json()).ineligible ?? []) as unknown[];
}

test("PAD-129: 'Everyone' on one class beats the standard bar, and the sheet says where the bar came from", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const token = await coachToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const academy = await academyEvent(request, token);
  await request.post(`${API_ROOT}/app/notify/config`, { headers: auth, data: { eligibilityRules: [{ attribute: "level", operation: "same_as_class" }] } });
  try {
    // Standard bar in force: the stronger student fails it.
    expect(await ineligibleFor(request, token, academy)).toHaveLength(1);

    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS)).toBe(true);
    await page.getByText(CLASS).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("class-eligibility-source")).toHaveAttribute("data-source", "coach");

    // Enter edit mode; the sheet finishes loading its instance around the
    // first paint, so retry the Edit tap until the Save button shows up.
    const saveButton = sheet.getByRole("button", { name: /^(save|guardar)$/i }).first();
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await saveButton.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await expect(saveButton).toBeVisible();
    const everyone = sheet.getByTestId("class-eligibility-mode-everyone");
    await expect(everyone).toBeVisible({ timeout: 10_000 });
    await everyone.click();
    const saved = page.waitForResponse((r) => /\/api\/app\/edit_class/.test(r.url()) && r.status() === 200);
    await saveButton.click();
    expect((await saved).ok()).toBeTruthy();

    // The instance tier now says everyone; the standard bar is ignored for this class.
    expect(await ineligibleFor(request, token, academy)).toHaveLength(0);
    const detail = await request.post(
      `${API_ROOT}/app/class_instance?model=${academy.model}&id=${academy.originalId}&date=${academy.date}`,
      { headers: auth }
    );
    const payload = await detail.json();
    expect(payload.eligibilityRules).toEqual([]);
    expect(payload.eligibilitySource).toBe("instance");

    // And the sheet shows the provenance after a reload.
    await page.reload();
    expect(await findClassOnCalendar(page, CLASS)).toBe(true);
    await page.getByText(CLASS).first().click();
    await expect(page.getByRole("dialog").getByTestId("class-eligibility-source")).toHaveAttribute("data-source", "instance");
  } finally {
    await request.post(`${API_ROOT}/app/edit_class`, {
      headers: auth,
      data: { event: academy, scope: "single", updates: { eligibilityRules: null } },
    });
    await request.post(`${API_ROOT}/app/notify/config`, { headers: auth, data: { eligibilityRules: null } });
  }
});
