/**
 * PAD-404 — evaluations.reminders: the "Frequência de avaliações" setting in
 * Settings → Preferences and the server-computed `due` marker it turns on, on
 * the players list (rule 4) and on the class evaluation panel (rule 4).
 *
 * "E2E Student" (the seed's `student`) has never been evaluated by `e2e-coach`
 * — nothing in `seed.py` files an `EvaluationRecord` for that link (only
 * "E2E Student Two" gets evaluation history) — so `monthly` marks it due
 * (rule 3: a never-evaluated player is due) without any seed change. `monthly`
 * is used rather than `every_n_classes` because it is the more robust of the
 * two: it needs no presence fixture, only "never evaluated", which the seed
 * already guarantees for this student.
 *
 * `test.afterEach` restores `{reminder: 'never'}` through the API (R-040): the
 * coach's `notification_configs` row is shared across the whole E2E run, and a
 * frequency left on `monthly` would mark players due for every spec that reads
 * the players list or a class panel after this one.
 *
 * Locates by test id only — `ui()` is used only for the "Preferences" nav
 * button, which has no test id (request-alerts-optout.spec.ts's pattern).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings, openPlayers, openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";

const STUDENT_NAME = "E2E Student";
const ACADEMY_CLASS_TITLE = "E2E Academy Class";

async function openPreferences(page: Page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: ui("settings.nav.preferences") })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: ui("settings.preferences.title") })
  ).toBeVisible({ timeout: 5000 });
}

async function coachApiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}

async function studentPlayerId(request: APIRequestContext, coachTok: string): Promise<number> {
  const res = await request.get(`${API_APP}/coach_players`, {
    headers: { Authorization: `Bearer ${coachTok}` },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === STUDENT_NAME);
  expect(found, `${STUDENT_NAME} is on the coach's roster`).toBeTruthy();
  return Number(found!.playerId);
}

async function pickReminder(page: Page, option: "monthly" | "never") {
  const request = page.waitForResponse(
    (r) =>
      /\/api\/app\/evaluation_settings$/.test(r.url()) &&
      r.request().method() === "PUT" &&
      r.status() === 200
  );
  await page.getByTestId(`settings-evaluation-reminder-option-${option}`).click();
  await request;
}

test.afterEach(async ({ page }) => {
  const accessToken = await page
    .evaluate(() => localStorage.getItem("accessToken"))
    .catch(() => null);
  if (!accessToken) return;
  await page
    .request.put(`${API_APP}/evaluation_settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { reminder: "never" },
    })
    .catch(() => undefined);
});

test("PAD-404: monthly marks the never-evaluated seeded student due on the players list; never clears it", async ({
  page,
  request,
}) => {
  const coachTok = await coachApiToken(request);
  const playerId = await studentPlayerId(request, coachTok);

  await loginAsCoach(page);
  await openPreferences(page);

  const container = page.getByTestId("settings-evaluation-reminder");
  await expect(container).toBeVisible({ timeout: 5000 });

  await pickReminder(page, "monthly");

  await openPlayers(page);
  const card = page.getByTestId(`player-card-${playerId}`);
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId(`player-due-${playerId}`)).toBeVisible({ timeout: 10_000 });

  await openPreferences(page);
  await pickReminder(page, "never");

  await openPlayers(page);
  await expect(page.getByTestId(`player-due-${playerId}`)).toHaveCount(0);
});

test("PAD-404: monthly marks the same student due on the class evaluation panel", async ({
  page,
  request,
}) => {
  const coachTok = await coachApiToken(request);
  const playerId = await studentPlayerId(request, coachTok);

  await loginAsCoach(page);
  await openPreferences(page);
  await expect(page.getByTestId("settings-evaluation-reminder")).toBeVisible({ timeout: 5000 });
  await pickReminder(page, "monthly");

  await openCalendar(page);
  const found = await findClassOnCalendar(page, ACADEMY_CLASS_TITLE);
  expect(found, `"${ACADEMY_CLASS_TITLE}" is on the calendar`).toBe(true);
  await page.getByTestId("calendar-event-card").filter({ hasText: ACADEMY_CLASS_TITLE }).first().click();
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

  await page.getByTestId("class-evaluations-open").click();
  await expect(page.getByTestId("class-evaluations-panel")).toBeVisible({ timeout: 10_000 });

  const row = page.getByTestId(`class-eval-row-${playerId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByTestId(`class-eval-due-${playerId}`)).toBeVisible({ timeout: 10_000 });
});
