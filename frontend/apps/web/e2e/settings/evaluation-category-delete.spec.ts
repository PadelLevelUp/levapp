import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-274 / evaluations.competencies rule 9, ported by PAD-373 from the Settings category
// editor to "Gerir competências". Deleting a competency deletes every score in it, so the
// coach first sees how many scores across how many players, and the delete waits for the
// typed name — now through the NEW impact + DELETE endpoints. The legacy ones are frozen
// for the App Store builds, and the new UI must call none of them.
//
// By test id only. The old editor's middle case ("a row added in the form and never
// saved is removed without asking") has no equivalent: the manager holds no unsaved
// rows — every change applies when made (rule 12) — so that is what its test pins now.

const LEGACY_CALLS =
  /\/app\/(evaluation_categories\b|add_evaluation_categories|delete\/evaluation_category|evaluation_category\/|add_evaluation_entry)/;

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function playerIdByName(request: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === name);
  expect(found, `${name} is on the coach's roster`).toBeTruthy();
  return String(found!.playerId);
}

/** R-040: whatever a test created and did not delete itself goes here, by id. */
const created: number[] = [];
test.afterEach(async ({ request }) => {
  if (created.length === 0) return;
  const token = await coachToken(request);
  for (const id of created.splice(0)) {
    const res = await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) });
    expect.soft([200, 404], `cleanup of competency ${id}: ${res.status()}`).toContain(res.status());
  }
});

/** Every request the PAGE makes to a legacy evaluation endpoint (the `request` fixture is not the page). */
function watchLegacyCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (LEGACY_CALLS.test(r.url())) calls.push(`${r.method()} ${r.url()}`);
  });
  return calls;
}

async function openManagerFromSettings(page: Page) {
  await page.goto("/settings?tab=preferences");
  await page.getByTestId("settings-competencies-open").click();
  await expect(page.getByTestId("competency-manager")).toBeVisible({ timeout: 10_000 });
  // Opened over the page the coach was on: the tab is still in the URL (rule 11).
  await expect(page).toHaveURL(/tab=preferences/);
  await expect(page).toHaveURL(/competencies=open/);
}

test("US-373a: deleting a category the coach already had shows what it holds and waits for its typed name", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const name = `E2E Delete Cat ${Date.now().toString().slice(-6)}`;
  // Set up as an OLD client would have: a legacy category with one score (the frozen
  // endpoints are the only way to make one). The UI under test never calls them.
  const saved = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token),
    data: [{ name, scaleMin: 1, scaleMax: 10 }],
  });
  expect(saved.ok()).toBeTruthy();
  const categories: { id: number; name: string }[] = await (
    await request.get(`${API_APP}/evaluation_categories`, { headers: bearer(token) })
  ).json();
  const category = categories.find((c) => c.name === name);
  expect(category, "the new category was saved").toBeTruthy();
  created.push(category!.id);
  const studentId = await playerIdByName(request, token, "E2E Student");
  const scored = await request.post(`${API_APP}/add_evaluation_entry`, {
    headers: bearer(token),
    data: { playerId: studentId, scores: [{ categoryId: String(category!.id), value: 5 }], strengths: [], weaknesses: [] },
  });
  expect(scored.ok()).toBeTruthy();

  await loginAsCoach(page);
  const legacyCalls = watchLegacyCalls(page);
  await openManagerFromSettings(page);

  const rowId = `id-${category!.id}`;
  const row = page.getByTestId(`competency-row-${rowId}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toHaveAttribute("data-kind", "legacy");
  await expect(row).toHaveAttribute("data-active", "true");
  // A legacy category writes its own scale out; it is never stars (rule 3).
  await expect(page.getByTestId(`competency-scale-${rowId}`)).toContainText("1–10");

  await page.getByTestId(`competency-delete-${rowId}`).click();
  const dialog = page.getByTestId("competency-delete-dialog"); // nested Radix dialogs: by test id, never by role
  await expect(dialog.getByTestId("competency-delete-impact")).toContainText(/\b1\b\D+\b1\b/, { timeout: 10_000 });
  const confirm = dialog.getByTestId("competency-delete-confirm");
  const typed = dialog.getByTestId("competency-delete-name");
  await expect(confirm).toBeDisabled();
  await typed.fill(name.toUpperCase());
  await expect(confirm).toBeDisabled();
  await typed.fill(name);
  await expect(confirm).toBeEnabled();

  const deleted = page.waitForResponse(
    (r) => r.request().method() === "DELETE" && r.url().endsWith(`/evaluation_competency/${category!.id}`),
  );
  await confirm.click();
  expect((await deleted).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(0);

  const after = await request.get(`${API_APP}/evaluation_competency/${category!.id}/impact`, { headers: bearer(token) });
  expect(after.status()).toBe(404);
  created.splice(created.indexOf(category!.id), 1);
  expect(legacyCalls, "the manager called a frozen legacy endpoint").toEqual([]);
});

test("US-373b: a competency added in the manager exists at once — there is no unsaved row to discard", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  await loginAsCoach(page);
  const legacyCalls = watchLegacyCalls(page);
  await openManagerFromSettings(page);

  const name = `E2E Custom ${Date.now().toString().slice(-6)}`;
  await page.getByTestId("competency-add-name").fill(name);
  const posted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/evaluation_competency"),
  );
  await page.getByTestId("competency-add-submit").click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: number };
  created.push(id);

  const row = page.getByTestId(`competency-row-id-${id}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toHaveAttribute("data-kind", "custom");
  await expect(row).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("competency-add-name")).toHaveValue("");

  // Closing discards nothing: it is on the server, as a 1–5 custom competency.
  await page.getByTestId("competency-manager-done").click();
  await expect(page.getByTestId("competency-manager")).toHaveCount(0);
  await expect(page).not.toHaveURL(/competencies=open/);
  const held: { competencies: { id: number; name: string; group: string | null; scaleMax: number; isActive: boolean }[] } =
    await (await request.get(`${API_APP}/evaluation_competencies`, { headers: bearer(token) })).json();
  const mine = held.competencies.find((c) => c.id === id);
  expect(mine, "the competency the manager created is held by the coach").toBeTruthy();
  expect([mine!.name, mine!.group, mine!.scaleMax, mine!.isActive]).toEqual([name, "custom", 5, true]);

  // The same name again is refused inline, and what was typed stays (rule 6).
  await page.getByTestId("settings-competencies-open").click();
  await page.getByTestId("competency-add-name").fill(`  ${name.toLowerCase()} `);
  await page.getByTestId("competency-add-submit").click();
  await expect(page.getByTestId("competency-add-error")).toBeVisible();
  await expect(page.getByTestId("competency-add-name")).toHaveValue(`  ${name.toLowerCase()} `);
  expect(legacyCalls, "the manager called a frozen legacy endpoint").toEqual([]);
});

test("US-373c: a competency created in the manager asks before it is deleted, without a reload", async ({ page }) => {
  await loginAsCoach(page);
  const legacyCalls = watchLegacyCalls(page);
  await openManagerFromSettings(page);

  const name = `E2E Saved Cat ${Date.now().toString().slice(-6)}`;
  await page.getByTestId("competency-add-name").fill(name);
  const posted = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/evaluation_competency"),
  );
  await page.getByTestId("competency-add-submit").click();
  const { id } = (await (await posted).json()) as { id: number };
  created.push(id);

  await page.getByTestId(`competency-delete-id-${id}`).click();
  const dialog = page.getByTestId("competency-delete-dialog"); // nested Radix dialogs: by test id, never by role
  // No score yet: the impact is shown (not the failure state), and the name is still asked for.
  await expect(dialog.getByTestId("competency-delete-impact")).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByTestId("competency-delete-confirm")).toBeDisabled();
  await dialog.getByTestId("competency-delete-name").fill(name);
  const deleted = page.waitForResponse(
    (r) => r.request().method() === "DELETE" && r.url().endsWith(`/evaluation_competency/${id}`),
  );
  await dialog.getByTestId("competency-delete-confirm").click();
  expect((await deleted).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId(`competency-row-id-${id}`)).toHaveCount(0);
  created.splice(created.indexOf(id), 1);
  expect(legacyCalls, "the manager called a frozen legacy endpoint").toEqual([]);
});
