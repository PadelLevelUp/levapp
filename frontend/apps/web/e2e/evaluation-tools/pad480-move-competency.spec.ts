/**
 * PAD-480 — evaluations.competencies rule 15 "Moving": in "Definir categorias de avaliação" a coach
 * moves a sub-category under another of their categories, and the server holds the new parent.
 *
 * Builds its own rows through the API (two custom categories and a sub-category of the first) and
 * deletes the two categories at the end, which takes the sub-category with them (rule 9), so the shared
 * coach is left as it was (R-040). Located by test id; the target is picked by the row id the API gave.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

async function create(request: APIRequestContext, token: string, data: object): Promise<{ id: number; parentId: number | null }> {
  const res = await request.post(`${API_APP}/evaluation_competency`, { headers: bearer(token), data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

test("PAD-480: a sub-category is moved under another category from the manager", async ({ page, request }) => {
  const token = await coachToken(request);
  const tag = Date.now().toString().slice(-6);
  const first = await create(request, token, { name: `E2E Mover A ${tag}` });
  const second = await create(request, token, { name: `E2E Mover B ${tag}` });
  const sub = await create(request, token, { name: `E2E Mover sub ${tag}`, parentId: first.id });
  try {
    await loginAsCoach(page);
    await page.goto("/settings?tab=preferences&competencies=open");
    await expect(page.getByTestId("competency-manager")).toBeVisible({ timeout: 15000 });

    const row = `id-${sub.id}`;
    await page.getByTestId(`competency-move-${row}`).click();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/app/evaluation_competency/${sub.id}`) && r.request().method() === "PATCH" && r.ok(),
    );
    await page.getByTestId(`competency-move-to-${row}-${second.id}`).click();
    expect((await saved).request().postDataJSON()).toEqual({ parentId: second.id });

    // The row now sits in the second category's section, and the server says so.
    await expect(page.getByTestId(`competency-section-id-${second.id}`).getByTestId(`competency-row-${row}`)).toBeVisible();
    const list = await (await request.get(`${API_APP}/evaluation_competencies`, { headers: bearer(token) })).json();
    expect(list.competencies.find((c: { id: number }) => c.id === sub.id).parentId).toBe(second.id);
  } finally {
    for (const id of [first.id, second.id]) {
      await request.delete(`${API_APP}/evaluation_competency/${id}`, { headers: bearer(token) }).catch(() => undefined);
    }
  }
});
