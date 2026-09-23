import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-337's guarantee, carried into the record form (PAD-374; evaluations.records rules 5 and 10,
// evaluations.history rule 4): a save writes only what the coach gave, and a coach can decline to
// score. The old sheet had a save button and posted the whole set; "Nova avaliação" saves each input
// as it is made, so the guarantee now reads: opening the form and finishing it without touching
// anything sends NO request and writes nothing; and a competency the coach rated and then cleared
// holds nothing. Each test creates its own legacy categories (stars, PAD-403: the server echoes
// every legacy category 1-5 whatever scale the body sends), so earlier evaluations of the seeded
// student do not matter. Test ids and stored data only — never rendered copy (B-103).

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

// R-040: a spec removes what it wrote. Every category made here is deleted after its test through the
// record API's delete (legal for a legacy category; it takes the scores with it and the server prunes the
// evaluation record they leave empty), so neither the player's history nor the coach's competency set
// grows with each run. Until PAD-374 these rows were simply left behind.
const created: string[] = [];

test.afterEach(async ({ request }) => {
  if (created.length === 0) return;
  const token = await coachToken(request);
  for (const id of created.splice(0)) {
    const gone = await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) });
    expect(gone.ok(), `category ${id} was cleaned up`).toBeTruthy();
  }
});

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
  const ids = names.map((name) => {
    const cat = all.find((c) => c.name === name);
    expect(cat, `${name} was saved`).toBeTruthy();
    return String(cat!.id);
  });
  created.push(...ids);
  return ids;
}

type Rating = { categoryId: number; score: number };
type EvalRecord = { id: number; editable: boolean; classInstanceId: number | null; ratings: Rating[] };

/** Today's class-less record as the v2 API serves it (the form's own read), or undefined. */
async function todaysRecord(request: APIRequestContext, token: string, playerId: string): Promise<EvalRecord | undefined> {
  const res = await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const records: EvalRecord[] = (await res.json()).records ?? [];
  return records.find((r) => r.editable && r.classInstanceId === null);
}

async function openForm(page: Page, playerId: string) {
  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("evaluation-new").click();
  const form = page.getByTestId("evaluation-form");
  await expect(form).toBeVisible({ timeout: 10_000 });
  // Every locator below is scoped to the form: a history card draws the same competency with the same test id.
  return form;
}

test("PAD-337: finishing the form without touching anything sends no request and writes nothing", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const [catId] = await newCategories(request, token, 1);
  const before = await todaysRecord(request, token, playerId);

  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/evaluation_record")) writes.push(r.url());
  });
  const form = await openForm(page, playerId);
  // PAD-403: the new category opens unrated as stars — no star lit — not at a stepper's midpoint.
  await expect(form.getByTestId(`evaluation-stars-${catId}`)).toHaveAttribute("data-score", "");
  await page.getByTestId("evaluation-finish").click();
  await expect(page.getByTestId("evaluation-form")).toHaveCount(0);

  expect(writes).toEqual([]);
  const after = await todaysRecord(request, token, playerId);
  expect(after?.ratings.map((r) => r.categoryId) ?? []).toEqual(before?.ratings.map((r) => r.categoryId) ?? []);
  expect((after?.ratings ?? []).find((r) => String(r.categoryId) === catId)).toBeUndefined();
});

test("PAD-337: only the category the coach scored is written, and clearing returns one to unrated", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const [scored, cleared, untouched] = await newCategories(request, token, 3);

  const form = await openForm(page, playerId);
  for (const catId of [scored, cleared]) {
    // PAD-403: a star tap saves at once (no stepper quiet period to wait out) — wait for that PUT.
    const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"));
    await form.getByTestId(`evaluation-star-${catId}-4`).click();
    expect((await put).status()).toBe(200);
    await expect(form.getByTestId(`evaluation-stars-${catId}`)).not.toHaveAttribute("data-score", "");
  }
  // Tapping the lit star again clears it (nextStarScore) — the star equivalent of the stepper's own "clear" button.
  const clearedPut = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"));
  await form.getByTestId(`evaluation-star-${cleared}-4`).click();
  expect((await clearedPut).status()).toBe(200);
  await expect(form.getByTestId(`evaluation-stars-${cleared}`)).toHaveAttribute("data-score", "");
  await expect(form.getByTestId(`evaluation-stars-${untouched}`)).toHaveAttribute("data-score", "");
  await page.getByTestId("evaluation-finish").click();
  await expect(form).toHaveCount(0);

  const record = await todaysRecord(request, token, playerId);
  const ids = (record?.ratings ?? []).map((r) => String(r.categoryId));
  expect(ids).toContain(scored);
  expect(ids).not.toContain(cleared);
  expect(ids).not.toContain(untouched);

  // The history card follows the writes: the cleared competency leaves it, the scored one stays.
  const card = page.getByTestId(`evaluation-history-card-${record?.id}`);
  await expect(card.getByTestId(`evaluation-stars-${scored}`)).not.toHaveAttribute("data-score", "");
  await expect(card.getByTestId(`evaluation-stars-${cleared}`)).toHaveCount(0);
});
