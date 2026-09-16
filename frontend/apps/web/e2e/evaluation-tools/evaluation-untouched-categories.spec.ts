import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-337 / evaluations.entries rule 6. The evaluation sheet used to seed every
// category at its scale midpoint and post all of them on save, so a coach who
// touched nothing still wrote a "grade" for every category. A category the
// coach does not score now submits nothing. Each test creates its own
// categories, so earlier evaluations of the seeded student do not matter.

type Evaluation = { categoryId: string | number; score: number; evaluatedAt: string };

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
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

async function newCategories(request: APIRequestContext, token: string, count: number): Promise<string[]> {
  const stamp = Date.now().toString().slice(-6);
  const names = Array.from({ length: count }, (_, i) => `E2E Unrated ${stamp} ${i}`);
  const saved = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token),
    data: names.map((name) => ({ name, scaleMin: 1, scaleMax: 10 })),
  });
  expect(saved.ok()).toBeTruthy();
  const all: { id: string | number; name: string }[] = await (
    await request.get(`${API_APP}/evaluation_categories`, { headers: bearer(token) })
  ).json();
  return names.map((name) => {
    const cat = all.find((c) => c.name === name);
    expect(cat, `${name} was saved`).toBeTruthy();
    return String(cat!.id);
  });
}

async function evaluations(request: APIRequestContext, token: string, playerId: string): Promise<Evaluation[]> {
  const res = await request.get(`${API_APP}/player_profile/${playerId}`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).evaluations ?? [];
}

async function openSheet(page: Page, playerId: string) {
  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await page.getByTestId("player-add-evaluation").click();
  await expect(page.getByTestId("evaluation-save")).toBeVisible({ timeout: 10_000 });
}

async function save(page: Page) {
  const posted = page.waitForResponse((r) => r.url().includes("/add_evaluation_entry"));
  await page.getByTestId("evaluation-save").click();
  expect((await posted).status()).toBe(200);
  await expect(page.getByTestId("evaluation-save")).toHaveCount(0);
}

test("PAD-337: saving without touching a slider writes no evaluation entry", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const [catId] = await newCategories(request, token, 1);

  await openSheet(page, playerId);
  // The new category opens unrated, not at a midpoint score. Soft, so the
  // persisted-data assertion below is still checked if the display regresses.
  await expect.soft(page.getByTestId(`evaluation-score-value-${catId}`)).toHaveAttribute("data-rated", "false");
  await save(page);

  const after = await evaluations(request, token, playerId);
  expect(after.find((e) => String(e.categoryId) === catId)).toBeUndefined();
});

test("PAD-337: only the category the coach scored is written, and reset returns one to unrated", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const [scored, reset, untouched] = await newCategories(request, token, 3);

  await openSheet(page, playerId);
  for (const catId of [scored, reset]) {
    const thumb = page.getByTestId(`evaluation-score-${catId}`).getByRole("slider");
    await thumb.focus();
    await thumb.press("ArrowRight");
    await expect(page.getByTestId(`evaluation-score-value-${catId}`)).toHaveAttribute("data-rated", "true");
  }
  await page.getByTestId(`evaluation-score-reset-${reset}`).click();
  await expect(page.getByTestId(`evaluation-score-value-${reset}`)).toHaveAttribute("data-rated", "false");
  await expect(page.getByTestId(`evaluation-score-value-${untouched}`)).toHaveAttribute("data-rated", "false");
  await save(page);

  const after = await evaluations(request, token, playerId);
  const ids = after.map((e) => String(e.categoryId));
  expect(ids).toContain(scored);
  expect(ids).not.toContain(reset);
  expect(ids).not.toContain(untouched);
});
