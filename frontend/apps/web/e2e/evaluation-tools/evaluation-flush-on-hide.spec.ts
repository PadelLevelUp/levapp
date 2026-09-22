/**
 * evaluations.records rule 7 (PAD-396): a debounced write still inside its quiet period reaches
 * the server when the page is hidden. Originally exercised through a legacy category's stepper
 * (`step`, debounced ~400ms); PAD-403 makes every category 1-5 stars, and a star tap saves at
 * once (`rate`, no quiet period — see `EvaluationFormSession.rate` in
 * packages/config/src/evaluation-form-session.ts) — so there is no longer a rating write that can
 * be caught mid-debounce. The note field is still debounced (~800ms, `useFlushOnPageHide`'s own
 * doc comment: "a stepper's step or the note's text inside their quiet period"), so this spec now
 * edits the note instead: it types once and, before the quiet period can elapse, hides the page
 * (`visibilitychange` → hidden) and then closes it; the server — not the screen — is asked
 * whether the note arrived. R-040: the category it makes (only so the form has a row to render,
 * never rated) is deleted afterwards, which takes the record with it.
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

/** One category of this spec's own, so the form has a row to render (an empty competency list
 *  shows no note field at all) and the cleanup is exact. Deliberately through the FROZEN
 *  `POST /add_evaluation_categories` (R-047) — PAD-403: the server stores and echoes it 1-5
 *  regardless of the body, so this is a star row like any other; this spec never taps it, only
 *  the shared note field below it. A test helper, not the new UI. */
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

type EvalRecord = { id: number; editable: boolean; classInstanceId: number | null; note: string; ratings: { categoryId: number; score: number }[] };
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

test("PAD-396: a note edit made just before the page is hidden still reaches the server", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const catId = await newCategory(request, token);
  created.push(catId);
  expect((await todaysRecord(request, token, playerId))?.note ?? "").toBe("");

  const form = await openForm(page, playerId);
  await expect(form).toBeVisible({ timeout: 10_000 });
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/evaluation_record"), { timeout: 10_000 });
  // PAD-403: a star tap on this category would save at once (no quiet period); the note field is
  // still debounced (~800ms), so it is the note that starts its quiet period here.
  await form.getByTestId("evaluation-note").fill("PAD-396 quiet period");
  // Hide the page at once — the tab switched away — then close it: the flush must have STARTED the PUT
  // before the page is gone, through the session's own queue.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await put).status()).toBe(200);
  await page.close();

  const after = await todaysRecord(request, token, playerId);
  expect(after?.note, "the note reached the server").toBe("PAD-396 quiet period");
});

test("PAD-396: a note edit made just before the tab is CLOSED still reaches the server — without waiting for the request first", async ({ page, request }) => {
  const token = await coachToken(request);
  const playerId = await studentId(request, token);
  const catId = await newCategory(request, token);
  created.push(catId);

  const form = await openForm(page, playerId);
  await expect(form).toBeVisible({ timeout: 10_000 });
  // PAD-403: the note field, not the (now immediate) star tap, is what still has a quiet period.
  await form.getByTestId("evaluation-note").fill("PAD-396 closed tab");
  // Close at once: pagehide fires, the flush sends the PUT with keepalive, the page is gone. Nothing is awaited
  // on the page side — the server is the only witness.
  await page.close();

  await expect
    .poll(async () => (await todaysRecord(request, token, playerId))?.note ?? null, {
      timeout: 10_000,
      message: "the note made just before the tab closed reached the server",
    })
    .toBe("PAD-396 closed tab");
});
