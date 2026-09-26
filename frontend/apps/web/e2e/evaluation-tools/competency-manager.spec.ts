import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, loginAsStudent, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-373 / evaluations.competencies rules 5-8 and 11-14 — "Gerir competências" on web.
// One manager, opened OVER whatever page the coach is on (`?competencies=open`); every
// change applies when made. Adding, the duplicate name and the typed-name delete are in
// e2e/settings/evaluation-category-delete.spec.ts; this file is the rest.
//
// By test id, state attribute and the server's own answers — never rendered copy. Each
// test puts back what it changed through the API (R-040); the catalogue competency it
// switches is "smash", which no other spec or Maestro flow touches.

interface Competency {
  id: number;
  key: string | null;
  name: string;
  group: string | null;
  isActive: boolean;
}

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function heldCompetencies(request: APIRequestContext, token: string): Promise<Competency[]> {
  const res = await request.get(`${API_APP}/evaluation_competencies`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { competencies: Competency[] }).competencies;
}

/** The catalogue competency exists for the coach and is switched OFF: a known side to toggle from. */
async function catalogueCompetencyOff(request: APIRequestContext, token: string, key: string): Promise<number> {
  const on = await request.post(`${API_APP}/evaluation_competency`, { headers: bearer(token), data: { catalogueKey: key } });
  expect(on.ok()).toBeTruthy();
  const { id } = (await on.json()) as { id: number };
  const off = await request.patch(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token), data: { isActive: false } });
  expect(off.ok()).toBeTruthy();
  return id;
}

async function playerIdByName(request: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { playerId: number | string; name: string }[] = Array.isArray(data) ? data : data.items;
  const found = players.find((p) => p.name === name);
  expect(found, `${name} is on the coach's roster`).toBeTruthy();
  return String(found!.playerId);
}

const createdIds: number[] = [];
const switchedOff: number[] = [];
test.afterEach(async ({ request }) => {
  if (createdIds.length === 0 && switchedOff.length === 0) return;
  const token = await coachToken(request);
  for (const id of createdIds.splice(0)) {
    const res = await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) });
    expect.soft([200, 404], `cleanup of competency ${id}: ${res.status()}`).toContain(res.status());
  }
  for (const id of switchedOff.splice(0)) {
    const res = await request.patch(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token), data: { isActive: false } });
    expect.soft(res.ok(), `competency ${id} switched back off`).toBeTruthy();
  }
});

test("US-373d: a catalogue switch applies when made, over the page the coach was on, and the evaluation form has it", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const smashId = await catalogueCompetencyOff(request, token, "smash");
  switchedOff.push(smashId);
  const playerId = await playerIdByName(request, token, "E2E Student");

  await loginAsCoach(page);
  // A deep link: the manager opens over the player's page, which stays underneath (rule 11).
  await page.goto(`/players/${playerId}?competencies=open`);
  const manager = page.getByTestId("competency-manager");
  await expect(manager).toBeVisible({ timeout: 10_000 });
  await expect(manager).toHaveAttribute("data-presentation", "modal");

  const row = page.getByTestId("competency-row-key-smash");
  await expect(row).toHaveAttribute("data-kind", "catalogue");
  await expect(row).toHaveAttribute("data-active", "false");
  // PAD-431 (rules 8, 9): a default can be renamed and deleted too, besides switched.
  await expect(page.getByTestId("competency-rename-key-smash")).toHaveCount(1);
  await expect(page.getByTestId("competency-delete-key-smash")).toHaveCount(1);

  const patched = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/evaluation_competency/${smashId}`),
  );
  await page.getByTestId("competency-toggle-key-smash").click();
  expect((await patched).status()).toBe(200);
  await expect(row).toHaveAttribute("data-active", "true");
  // Nothing is pending: the server holds it before the manager is closed (rule 12).
  const held = (await heldCompetencies(request, token)).find((c) => c.id === smashId);
  expect(held?.isActive).toBe(true);

  await page.getByTestId("competency-manager-done").click();
  await expect(manager).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/players/${playerId}$`));
  await expect(page.getByTestId("evaluation-card")).toBeVisible();

  // One set per coach, used by every evaluation surface: the new evaluation form lists it.
  await page.getByTestId("player-evaluations-open").click();
  await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-new").click();
  // Scoped to the form: the history cards draw the same competencies with the same ids (Session-E).
  await expect(page.getByTestId("evaluation-form").getByTestId(`evaluation-row-${smashId}`)).toBeVisible({ timeout: 8000 });
  await page.getByTestId("evaluation-form-close").click();
});

test("US-373e: one of the coach's own is renamed by id, and a name already taken is refused on the row", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const stamp = Date.now().toString().slice(-6);
  const made = await request.post(`${API_APP}/evaluation_competency`, {
    headers: bearer(token),
    data: { name: `E2E Rename ${stamp}` },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: number };
  createdIds.push(id);

  await loginAsCoach(page);
  await page.goto("/settings?tab=preferences&competencies=open");
  await expect(page.getByTestId("competency-manager")).toBeVisible({ timeout: 10_000 });
  const rowId = `id-${id}`;
  await expect(page.getByTestId(`competency-row-${rowId}`)).toHaveAttribute("data-kind", "custom");

  await page.getByTestId(`competency-rename-${rowId}`).click();
  const input = page.getByTestId(`competency-rename-input-${rowId}`);
  await expect(input).toHaveValue(`E2E Rename ${stamp}`);
  const renamed = `E2E Renamed ${stamp}`;
  await input.fill(renamed);
  const patched = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/evaluation_competency/${id}`),
  );
  await page.getByTestId(`competency-rename-save-${rowId}`).click();
  expect((await patched).status()).toBe(200);
  await expect(input).toHaveCount(0);
  // Same row, same id: a rename is not a delete-and-recreate (rule 7).
  await expect(page.getByTestId(`competency-row-${rowId}`)).toBeVisible();
  expect((await heldCompetencies(request, token)).find((c) => c.id === id)?.name).toBe(renamed);

  // The seeded coach already has "Forehand": the same name in another case is refused, on
  // the row, with the field still open and what was typed kept (rule 6).
  await page.getByTestId(`competency-rename-${rowId}`).click();
  await input.fill("forehand");
  const refused = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/evaluation_competency/${id}`),
  );
  await page.getByTestId(`competency-rename-save-${rowId}`).click();
  expect((await refused).status()).toBe(409);
  await expect(page.getByTestId(`competency-error-${rowId}`)).toBeVisible();
  await expect(input).toHaveValue("forehand");
  expect((await heldCompetencies(request, token)).find((c) => c.id === id)?.name).toBe(renamed);
});

test("US-373f: at phone width the manager is a sheet, and its close is on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsCoach(page);
  await page.goto("/settings?tab=preferences&competencies=open");

  const manager = page.getByTestId("competency-manager");
  await expect(manager).toBeVisible({ timeout: 10_000 });
  await expect(manager).toHaveAttribute("data-presentation", "sheet");
  await expect(page.getByTestId("competency-group-legacy")).toBeVisible();
  const done = page.getByTestId("competency-manager-done");
  await expect(done).toBeInViewport();
  await done.click();
  await expect(manager).toHaveCount(0);
  await expect(page).not.toHaveURL(/competencies=open/);
});

test("US-373g: a student who follows the manager's link sees no manager", async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/settings?tab=connections&competencies=open");
  // The page itself has rendered — so the absence below is not a page still loading.
  await expect(page.getByTestId("settings-connect-coach")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("competency-manager")).toHaveCount(0);
});
