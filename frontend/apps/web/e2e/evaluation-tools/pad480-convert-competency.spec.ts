/**
 * PAD-480 — evaluations.competencies rule 18: in "Definir categorias de avaliação" a coach converts a
 * legacy category named like a default into that default category, and the dialog moves the default's
 * stray sub-category under it. The server holds both changes.
 *
 * Builds its own rows through the API: a legacy "Tática " (trailing space, as prod stores them) through
 * the legacy upsert, then Transição, which the server leaves at the top level because the legacy row
 * holds the default's name (rule 15 "Creating"). Deleting the converted category at the end takes
 * Transição with it (rule 9), so the shared coach is left as it was (R-040). Located by test id.
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

type Row = { id: number; name: string; key: string | null; group: string | null; parentId: number | null };

async function list(request: APIRequestContext, token: string): Promise<Row[]> {
  const res = await request.get(`${API_APP}/evaluation_competencies`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).competencies;
}

test("PAD-480: a legacy category is converted into a default, and its stray moves under it", async ({ page, request }) => {
  const token = await coachToken(request);
  const legacy = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token), data: [{ name: "Tática ", scaleMin: 1, scaleMax: 5 }],
  });
  expect(legacy.ok(), await legacy.text()).toBeTruthy();
  const tatica = (await list(request, token)).find((c) => c.name === "Tática " && c.group === null)!;
  expect(tatica, "the legacy row exists").toBeTruthy();
  const stray = await request.post(`${API_APP}/evaluation_competency`, { headers: bearer(token), data: { catalogueKey: "transition" } });
  expect(stray.ok(), await stray.text()).toBeTruthy();
  const transicao: Row = await stray.json();
  expect(transicao.parentId, "the server left it at the top level").toBeNull();

  try {
    await loginAsCoach(page);
    await page.goto("/settings?tab=preferences&competencies=open");
    await expect(page.getByTestId("competency-manager")).toBeVisible({ timeout: 15000 });

    await page.getByTestId(`competency-convert-id-${tatica.id}`).click();
    const dialog = page.getByTestId("competency-convert-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("competency-convert-old-app")).toBeVisible();
    await expect(page.getByTestId("competency-convert-move")).toHaveAttribute("data-state", "checked");

    const converted = page.waitForResponse((r) => r.url().endsWith(`/evaluation_competency/${tatica.id}/convert`) && r.ok());
    const moved = page.waitForResponse(
      (r) => r.url().endsWith(`/evaluation_competency/${transicao.id}`) && r.request().method() === "PATCH" && r.ok(),
    );
    await page.getByTestId("competency-convert-confirm").click();
    expect((await converted).request().postDataJSON()).toEqual({ catalogueKey: "tactics" });
    expect((await moved).request().postDataJSON()).toEqual({ parentId: tatica.id });
    await expect(dialog).toBeHidden();

    // The row now heads Tática's section, with Transição under it, and the server says so.
    await expect(page.getByTestId("competency-section-key-tactics").getByTestId("competency-row-key-transition")).toBeVisible();
    const rows = await list(request, token);
    const after = rows.find((c) => c.id === tatica.id)!;
    expect([after.key, after.group, after.name]).toEqual(["tactics", "general", "Tática"]);
    expect(rows.find((c) => c.id === transicao.id)!.parentId).toBe(tatica.id);
  } finally {
    await request.delete(`${API_APP}/evaluation_competency/${tatica.id}`, { headers: bearer(token) }).catch(() => undefined);
    await request.delete(`${API_APP}/evaluation_competency/${transicao.id}`, { headers: bearer(token) }).catch(() => undefined);
  }
});
