// PAD-431 — evaluations.competencies rule 15 (categories and sub-categories) and
// settings.role-scope rule 3 (the "Avaliações" group), on web.
//
// 1. Settings → Preferences holds the categories, the frequency and the scale under one heading.
// 2. In "Definir categorias de avaliação" the coach adds a sub-category under Técnica; the server
//    holds it under Técnica, and "Nova avaliação" lists it under Técnica's heading.
//
// Test ids only (B-103). Técnica is shared with other specs (class-evaluations switches it on and
// off), so this spec puts it back as it found it and deletes the sub-category it made.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

interface Competency {
  id: number;
  key: string | null;
  name: string;
  isActive: boolean;
  parentId?: number | null;
}

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function held(request: APIRequestContext, token: string): Promise<Competency[]> {
  const res = await request.get(`${API_APP}/evaluation_competencies`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { competencies: Competency[] }).competencies;
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

test("PAD-431: the evaluation settings sit under one Avaliações heading, in order", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/settings?tab=preferences");

  const group = page.getByTestId("settings-evaluations");
  await expect(group).toBeVisible({ timeout: 15_000 });
  await expect(group.getByTestId("settings-evaluations-title")).toBeVisible();
  const ids = await group.locator("[data-testid]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-testid")).filter((id) =>
      id === "settings-competencies" || id === "settings-evaluation-reminder" || id === "settings-evaluation-scale"));
  expect(ids.filter((id, i) => ids.indexOf(id) === i)).toEqual([
    "settings-competencies", "settings-evaluation-reminder", "settings-evaluation-scale",
  ]);
});

test("PAD-431: a sub-category added under Técnica is held there and listed under Técnica on the form", async ({ page, request }) => {
  const token = await coachToken(request);
  // Técnica as a row the coach holds, active (idempotent switch-on); remember how it was.
  const before = (await held(request, token)).find((c) => c.key === "technique");
  const on = await request.post(`${API_APP}/evaluation_competency`, { headers: bearer(token), data: { catalogueKey: "technique" } });
  expect(on.ok()).toBeTruthy();
  const technique = (await on.json()) as Competency;
  const name = `E2E Sub ${Date.now().toString().slice(-6)}`;
  let subId: number | null = null;

  try {
    const playerId = await playerIdByName(request, token, "E2E Student");
    await loginAsCoach(page);
    await page.goto(`/players/${playerId}?competencies=open`);
    const section = page.getByTestId("competency-section-key-technique");
    await expect(section).toBeVisible({ timeout: 15_000 });

    const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/evaluation_competency"));
    await section.getByTestId("competency-add-sub-key-technique-name").fill(name);
    await section.getByTestId("competency-add-sub-key-technique-submit").click();
    const response = await created;
    expect(response.status()).toBe(201);
    const sub = (await response.json()) as Competency;
    subId = sub.id;
    expect(sub.parentId).toBe(technique.id);
    await expect(section.getByTestId(`competency-row-id-${sub.id}`)).toBeVisible();

    await page.getByTestId("competency-manager-done").click();
    await page.getByTestId("player-evaluations-open").click();
    await expect(page.getByTestId("player-evaluations-drawer")).toBeVisible({ timeout: 8000 });
    await page.getByTestId("evaluation-new").click();
    const form = page.getByTestId("evaluation-form");
    await expect(form.getByTestId(`evaluation-group-${technique.id}`).getByTestId(`evaluation-row-${sub.id}`)).toBeVisible({ timeout: 8000 });
    // Técnica has an active sub-category now, so it is not scored directly (rule 16).
    await expect(form.getByTestId(`evaluation-row-${technique.id}`)).toHaveCount(0);
    await page.getByTestId("evaluation-form-close").click();
  } finally {
    if (subId !== null) {
      const res = await request.delete(`${API_APP}/evaluation_competency/${subId}`, { headers: bearer(token) });
      expect.soft(res.ok(), `cleanup of sub-category ${subId}`).toBeTruthy();
    }
    if (!before || !before.isActive) {
      const res = await request.patch(`${API_APP}/evaluation_competency/${technique.id}`, { headers: bearer(token), data: { isActive: false } });
      expect.soft(res.ok(), "Técnica switched back off").toBeTruthy();
    }
  }
});
