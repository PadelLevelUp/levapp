/**
 * evaluations.sharing + evaluations.student-view (PAD-402): a coach shares an
 * evaluation record with e2e-student-2 ("E2E Student Two", seeded evaluation
 * history — a rated record already exists, `evaluations.evolution`'s
 * dataset), the student's dashboard gains an "Avaliações" block gated by the
 * `evaluations` capability token, and un-sharing removes it silently.
 *
 * Test ids and the server's own answers only — never rendered copy (B-103,
 * `e2e-web-renders-portuguese` memory): the E2E accounts render English once
 * signed in, so a copy assertion here would be both fragile and pointless.
 *
 * The share dialog is a Radix Dialog opened while the player-evaluations
 * drawer (a Sheet) is open; the outer focus trap marks the rest of the
 * document aria-hidden, so `getByRole("dialog")` would find nothing
 * (`playwright-role-queries-skip-nested-radix-dialogs` memory) — it is
 * asserted by `data-testid="share-evaluation-dialog"` instead.
 *
 * `evaluations.sharing` rule 10: any record can be shared, so this spec needs
 * no fixture of its own — it reuses the seed's first rated record for
 * e2e-student-2 and only ever writes/clears its `share`, never its ratings.
 * Every test un-shares that record in `afterEach` (idempotent — sharing rule
 * 9's `unshare` is a no-op on an already-unshared record), so reruns and any
 * ordering are safe.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  COACH_PASSWORD,
  COACH_USERNAME,
  STUDENT2_PASSWORD,
  STUDENT2_USERNAME,
  loginAsCoach,
  loginAsStudent2,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const STUDENT_NAME = "E2E Student Two";

// PAD-352 / PAD-364: apps/web/src/api/client.ts declares `capabilities: ["open-spots",
// "evaluations"]`; @levelup/api's client.ts joins them "<a>, <b>" onto this header
// (evaluations.student-view rule 5). A raw `request` call sends no header at all unless
// given one explicitly (this spec's own trap, per the leaf's Notes section).
const CAPABILITIES_HEADER = "X-LevApp-Capabilities";
const CAPABILITIES_VALUE = "open-spots, evaluations";

async function token(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function studentPlayerId(request: APIRequestContext, coachTok: string): Promise<number> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === STUDENT_NAME);
  expect(found, `${STUDENT_NAME} is on the coach's roster`).toBeTruthy();
  return Number(found!.playerId);
}

type RecordRating = { categoryId: number };
type SharableRecord = { id: number; ratings: RecordRating[]; share: unknown };

/** The seed's own history for e2e-student-2 holds at least one rated record
 *  (`evaluations.evolution`'s dataset, reused by PAD-375/376) — sharing needs no
 *  fixture of its own (sharing rule 10: any record, backfilled or not). */
async function sharableRecord(request: APIRequestContext, coachTok: string, playerId: number): Promise<SharableRecord> {
  const res = await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(coachTok) });
  expect(res.ok()).toBeTruthy();
  const { records } = (await res.json()) as { records: SharableRecord[] };
  const found = records.find((r) => r.ratings.length > 0);
  expect(found, `${STUDENT_NAME} has a rated record to share`).toBeTruthy();
  return found!;
}

/** Sharing rule 9: silent and idempotent — a record with no share is left alone. */
async function unshareViaApi(request: APIRequestContext, coachTok: string, recordId: number): Promise<void> {
  await request.delete(`${API_APP}/evaluation_record/${recordId}/share`, { headers: bearer(coachTok) });
}

async function shareViaApi(
  request: APIRequestContext,
  coachTok: string,
  recordId: number,
  categoryIds: number[]
): Promise<void> {
  const res = await request.post(`${API_APP}/evaluation_record/${recordId}/share`, {
    headers: bearer(coachTok),
    data: { categoryIds, evolution: "none", includeNote: false },
  });
  expect(res.ok(), `share record ${recordId}: ${res.status()}`).toBeTruthy();
}

/** Opens the coach's player-detail page and the player-evaluations drawer
 *  (mirrors `evaluation-evolution.spec.ts`'s `/players/${playerId}` + `player-evaluations-open`). */
async function openPlayerEvaluations(page: Page, playerId: number): Promise<void> {
  await page.goto(`/players/${playerId}`);
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 10_000 });
}

// Cleared in afterEach regardless of how far a test got — unshare is a safe no-op.
const recordsTouched: number[] = [];

test.afterEach(async ({ request }) => {
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  for (const id of recordsTouched.splice(0)) await unshareViaApi(request, coachTok, id);
});

test("US-402a: the coach shares one competency; the student's dashboard block and full list show the card", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const record = await sharableRecord(request, coachTok, playerId);
  recordsTouched.push(record.id);
  await unshareViaApi(request, coachTok, record.id); // start from a clean, unshared record

  await loginAsCoach(page);
  await openPlayerEvaluations(page, playerId);

  await page.getByTestId(`evaluation-history-share-${record.id}`).click();
  const dialog = page.getByTestId("share-evaluation-dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Untick every competency but the first — every box starts ticked (sharing rule 2).
  for (const rating of record.ratings.slice(1)) {
    await dialog.getByTestId(`share-category-${rating.categoryId}`).click();
  }

  const previewBtn = dialog.getByTestId("share-preview");
  await expect(previewBtn).toBeVisible();
  await previewBtn.click();

  const submitBtn = dialog.getByTestId("share-submit");
  await expect(submitBtn).toBeVisible({ timeout: 10_000 });
  const shareCall = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().includes(`/evaluation_record/${record.id}/share`) &&
      !r.url().includes("share_preview")
  );
  await submitBtn.click();
  const response = await shareCall;
  expect(response.status()).toBe(200);
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent2(studentPage);
    await studentPage.goto("/dashboard");

    const block = studentPage.getByTestId("student-evaluations-block");
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(block.getByTestId(`evaluation-shared-card-${record.id}`)).toBeVisible();
    // Only ONE card on the block: this record is the only thing shared right now.
    await expect(block.getByTestId(/^evaluation-shared-card-\d+$/)).toHaveCount(1);

    await studentPage.getByTestId("student-evaluations-see-all").click();
    const listPage = studentPage.getByTestId("student-evaluations-page");
    await expect(listPage).toBeVisible({ timeout: 10_000 });
    await expect(listPage.getByTestId(`evaluation-shared-card-${record.id}`)).toBeVisible();
  } finally {
    await studentCtx.close().catch(() => {});
  }
});

test("US-402b: un-sharing removes the card from the student's dashboard", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const record = await sharableRecord(request, coachTok, playerId);
  recordsTouched.push(record.id);
  await shareViaApi(request, coachTok, record.id, [record.ratings[0].categoryId]);

  await loginAsCoach(page);
  await openPlayerEvaluations(page, playerId);

  const unshareBtn = page.getByTestId(`evaluation-history-unshare-${record.id}`);
  await expect(unshareBtn).toBeVisible({ timeout: 10_000 });
  const unshareCall = page.waitForResponse(
    (r) => r.request().method() === "DELETE" && r.url().includes(`/evaluation_record/${record.id}/share`)
  );
  await unshareBtn.click();
  const response = await unshareCall;
  expect(response.status()).toBe(200);
  await expect(page.getByTestId(`evaluation-history-unshare-${record.id}`)).toHaveCount(0);

  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent2(studentPage);
    await studentPage.goto("/dashboard");
    await expect(studentPage.getByTestId("student-evaluations-block")).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await studentCtx.close().catch(() => {});
  }
});

test("US-402c: the dashboard block is gated by the X-LevApp-Capabilities header", async ({ request }) => {
  test.setTimeout(60_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const record = await sharableRecord(request, coachTok, playerId);
  recordsTouched.push(record.id);
  await shareViaApi(request, coachTok, record.id, [record.ratings[0].categoryId]);

  const studentTok = await token(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);

  const withHeader = await request.get(`${API_APP}/dashboard`, {
    headers: { ...bearer(studentTok), [CAPABILITIES_HEADER]: CAPABILITIES_VALUE },
  });
  expect(withHeader.ok()).toBeTruthy();
  const withBlocks = ((await withHeader.json()).blocks as { type: string }[]) ?? [];
  expect(withBlocks.some((b) => b.type === "evaluations"), "the block appears with the capability header").toBe(true);

  const withoutHeader = await request.get(`${API_APP}/dashboard`, { headers: bearer(studentTok) });
  expect(withoutHeader.ok()).toBeTruthy();
  const withoutBlocks = ((await withoutHeader.json()).blocks as { type: string }[]) ?? [];
  expect(withoutBlocks.some((b) => b.type === "evaluations"), "no header, no block").toBe(false);
});

test("US-402d: cancelling the share dialog writes nothing", async ({ page, request }) => {
  test.setTimeout(120_000);
  const coachTok = await token(request, COACH_USERNAME, COACH_PASSWORD);
  const playerId = await studentPlayerId(request, coachTok);
  const record = await sharableRecord(request, coachTok, playerId);
  recordsTouched.push(record.id);
  await unshareViaApi(request, coachTok, record.id); // start from a clean, unshared record

  await loginAsCoach(page);
  await openPlayerEvaluations(page, playerId);

  await page.getByTestId(`evaluation-history-share-${record.id}`).click();
  const dialog = page.getByTestId("share-evaluation-dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Untick one box, then abandon through the explicit cancel control (sharing rule 13).
  await dialog.getByTestId(`share-category-${record.ratings[0].categoryId}`).click();
  await dialog.getByTestId("share-cancel").click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const after = await request.get(`${API_APP}/player/${playerId}/evaluations`, { headers: bearer(coachTok) });
  expect(after.ok()).toBeTruthy();
  const found = ((await after.json()).records as { id: number; share: unknown }[]).find((r) => r.id === record.id);
  expect(found?.share ?? null).toBeNull();
});
