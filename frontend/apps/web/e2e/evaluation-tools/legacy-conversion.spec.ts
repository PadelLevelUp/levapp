/**
 * PAD-403 (evaluations.legacy-conversion): every legacy category (group/competency_group null) is
 * now a 1-5 star scale. `POST /add_evaluation_categories` — the frozen upsert an old client still
 * calls — stores and echoes 1/5 whatever scale its body sends, and the rating control the coach
 * sees is stars, never a stepper. Modelled on evaluation-untouched-categories.spec.ts for the
 * login/seed helpers. Test ids, attributes and API reads only — never rendered copy (B-103).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function studentId(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === "E2E Student");
  expect(found, "E2E Student is on the coach's roster").toBeTruthy();
  return String(found!.playerId);
}

// R-040: a spec removes what it wrote, through the same API the other evaluation specs use for teardown.
const created: string[] = [];
test.afterEach(async ({ request }) => {
  if (created.length === 0) return;
  const token = await coachToken(request);
  for (const id of created.splice(0)) {
    const gone = await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) });
    expect(gone.ok(), `category ${id} was cleaned up`).toBeTruthy();
  }
});

test("PAD-403: a legacy category posted as 0-10 is stored and echoed 1-5, and rates as stars", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const name = `E2E Legacy Conversion ${Date.now()}`;

  // Seed a legacy category the way an old client would — asking for a 0-10 scale.
  const saved = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token),
    data: [{ name, scaleMin: 0, scaleMax: 10 }],
  });
  expect(saved.ok()).toBeTruthy();

  // The server stores and echoes it 1-5, whatever the body asked for (PAD-403).
  const list: { id: number | string; name: string; scaleMin: number; scaleMax: number }[] = await (
    await request.get(`${API_APP}/evaluation_categories`, { headers: bearer(token) })
  ).json();
  const category = list.find((c) => c.name === name);
  expect(category, "the category was created").toBeTruthy();
  expect([category!.scaleMin, category!.scaleMax]).toEqual([1, 5]);
  const catId = String(category!.id);
  created.push(catId);

  // Rate it through the web UI: open the seeded player's evaluations and tap star 4.
  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("evaluation-new").click();
  const form = page.getByTestId("evaluation-form");
  await expect(form).toBeVisible({ timeout: 10_000 });

  // It never draws as a stepper — only stars, at the star row's own test id.
  await expect(form.getByTestId(`evaluation-stepper-${catId}-value`)).toHaveCount(0);
  await expect(form.getByTestId(`evaluation-stars-${catId}`)).toBeVisible();

  const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"));
  await form.getByTestId(`evaluation-star-${catId}-4`).click();
  expect((await put).status()).toBe(200);
  await page.getByTestId("evaluation-finish").click();
  await expect(page.getByTestId("evaluation-form")).toHaveCount(0);

  // Survives a hard reload, on the history card — stars, with the tapped score, never a stepper.
  await page.reload();
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });
  const card = page.getByTestId(/^evaluation-history-card-\d+$/).first();
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card.getByTestId(`evaluation-stars-${catId}`)).toHaveAttribute("data-score", "4");
  await expect(page.getByTestId(`evaluation-stepper-${catId}-value`)).toHaveCount(0);
});
