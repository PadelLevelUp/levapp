import { test, expect } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { clickPlayerCard } from "../helpers/players";
import { API_APP, API_AUTH } from "../helpers/api";
import { evaluationRecordIds, removeEvaluationRecordsSince } from "../helpers/cleanup";

// PAD-452 (B-180): the rating below files today's record on E2E Student. Left behind, it makes the
// student "evaluated" for every later spec (evaluation-reminder's due marker needs "never"), so the
// test deletes the record(s) it created.
let coachAuth: Record<string, string> = {};
let studentPlayerId = "";
let recordsBefore: Set<number> = new Set();
test.beforeEach(async ({ request }) => {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  coachAuth = { Authorization: `Bearer ${body.accessToken ?? body.access_token}` };
  const players = await (await request.get(`${API_APP}/coach_players`, { headers: coachAuth })).json();
  const list: { playerId: number | string; name: string }[] = Array.isArray(players) ? players : players.items;
  const found = list.find((p) => p.name === "E2E Student");
  expect(found, "E2E Student is on the coach's roster").toBeTruthy();
  studentPlayerId = String(found!.playerId);
  recordsBefore = await evaluationRecordIds(request, coachAuth, studentPlayerId);
});

test.afterEach(async ({ request }) => {
  if (studentPlayerId) await removeEvaluationRecordsSince(request, coachAuth, studentPlayerId, recordsBefore);
});

// PAD-56, carried into the record form (PAD-374): an evaluation the coach gives must actually
// persist — the old sheet once showed a false-success toast while nothing saved. "Nova avaliação"
// saves each input as it is made, so the observable is the PUT landing and the history card being
// there after a hard reload. Test ids and state attributes only, never rendered copy (B-103).
test("PAD-56: an evaluation given in the form persists and survives a reload", async ({ page }) => {
  await loginAsCoach(page);

  // Open a seeded player's detail page via the UI.
  await page.goto("/players");
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await clickPlayerCard(page, STUDENT_USERNAME);
  await expect(page).toHaveURL(/\/players\/\d+/);
  await expect(page.getByTestId("evaluation-card")).toBeVisible();

  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-new").click();

  // PAD-403: the seeded "Forehand" category is legacy (group/competency_group null), and every
  // legacy category is now 1-5 stars, never a stepper.
  const star = page.getByTestId("evaluation-form").getByTestId(/^evaluation-star-\d+-4$/).first();
  await expect(star).toBeVisible({ timeout: 8000 });
  // Armed BEFORE the click: the save landing is the observable, not a toast.
  const saved = page.waitForResponse(
    (r) => /\/evaluation_record/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
    { timeout: 8000 },
  );
  await star.click();
  await saved;
  await page.getByTestId("evaluation-finish").click();
  await expect(page.getByTestId("evaluation-form")).toHaveCount(0);

  // The evaluation is a history card now, holding a rated star score.
  const card = page.getByTestId(/^evaluation-history-card-\d+$/).first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId(/^evaluation-stars-\d+$/).first()).not.toHaveAttribute("data-score", "");

  // Core assertion: it persisted — a hard reload still shows it.
  await page.reload();
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId(/^evaluation-history-card-\d+$/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("evaluation-history-empty")).toHaveCount(0);
});
