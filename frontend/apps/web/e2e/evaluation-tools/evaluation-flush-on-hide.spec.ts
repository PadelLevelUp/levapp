/**
 * evaluations.records rule 7 (PAD-396): a stepper step still inside its quiet period reaches
 * the server when the page is hidden. The spec presses "+" once and, before the ~400 ms quiet
 * period can elapse, hides the page (`visibilitychange` → hidden) and then closes it; the
 * server — not the screen — is asked whether the step arrived. R-040: the category it makes
 * is deleted afterwards, which takes the record with it.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
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

/** One legacy (stepper) category of this spec's own, so the step has a row and the cleanup is exact.
 *  Deliberately through the FROZEN `POST /add_evaluation_categories` (R-047): only a legacy category has a
 *  stepper, and the stepper's quiet period is what these tests exercise. A test helper, not the new UI. */
async function newCategory(request: APIRequestContext, token: string): Promise<string> {
  const name = `E2E Flush ${Date.now()}`;
  const saved = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token), data: [{ name, scaleMin: 1, scaleMax: 10 }],
  });
  expect(saved.ok()).toBeTruthy();
  const list = await (await request.get(`${API_APP}/evaluation_categories`, { headers: bearer(token) })).json();
  const mine = (list as { id: number | string; name: string }[]).find((c) => c.name === name);
  expect(mine, "the category was created").toBeTruthy();
  return String(mine!.id);
}

type EvalRecord = { id: number; editable: boolean; classInstanceId: number | null; ratings: { categoryId: number; score: number }[] };
async function todaysRecord(request: APIRequestContext, token: string, playerId: string): Promise<EvalRecord | undefined> {
  const res = await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const records: EvalRecord[] = (await res.json()).records ?? [];
  return records.find((r) => r.editable && r.classInstanceId === null);
}

const created: string[] = [];
test.afterEach(async ({ request }) => {
  if (created.length === 0) return;
  const token = await coachToken(request);
  for (const id of created.splice(0)) {
    const gone = await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) });
    expect(gone.ok(), `category ${id} was cleaned up`).toBeTruthy();
  }
});

async function openForm(page: Page, playerId: string) {
  await loginAsCoach(page);
  await page.goto(`/players/${playerId}`);
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("evaluation-new").click();
  return page.getByTestId("evaluation-form");
}

test("PAD-396: a step made just before the page is hidden still reaches the server", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const catId = await newCategory(request, token);
  created.push(catId);
  expect((await todaysRecord(request, token, playerId))?.ratings.find((r) => String(r.categoryId) === catId)).toBeUndefined();

  const form = await openForm(page, playerId);
  await expect(form).toBeVisible({ timeout: 10_000 });
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"), { timeout: 10_000 });
  await form.getByTestId(`evaluation-stepper-${catId}-plus`).click(); // the step starts its ~400 ms quiet period
  // Hide the page at once — the tab switched away — then close it: the flush must have STARTED the PUT
  // before the page is gone, through the session's own queue.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await put).status()).toBe(200);
  await page.close();

  const after = await todaysRecord(request, token, playerId);
  const rating = after?.ratings.find((r) => String(r.categoryId) === catId);
  expect(rating, "the step reached the server").toBeTruthy();
  expect(rating!.score).toBe(6); // an unrated 1-10 stepper starts at the middle
});

test("PAD-396: a step made just before the tab is CLOSED still reaches the server — without waiting for the request first", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const catId = await newCategory(request, token);
  created.push(catId);

  const form = await openForm(page, playerId);
  await expect(form).toBeVisible({ timeout: 10_000 });
  await form.getByTestId(`evaluation-stepper-${catId}-plus`).click(); // inside its ~400 ms quiet period
  // Close at once: pagehide fires, the flush sends the PUT with keepalive, the page is gone. Nothing is awaited
  // on the page side — the server is the only witness.
  await page.close();

  await expect
    .poll(async () => (await todaysRecord(request, token, playerId))?.ratings.find((r) => String(r.categoryId) === catId)?.score ?? null, {
      timeout: 10_000,
      message: "the step made just before the tab closed reached the server",
    })
    .toBe(6);
});
