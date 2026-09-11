import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-274 / evaluations.categories rule 7. Deleting a saved category deletes
// every score in it, so the coach first sees how many scores across how many
// players, and the delete waits for the category's typed name. A row added in
// the form and never saved is removed without asking and without a request.

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

test("PAD-274: deleting a saved category shows what it holds and waits for its typed name", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const name = `E2E Delete Cat ${Date.now().toString().slice(-6)}`;
  const saved = await request.post(`${API_APP}/add_evaluation_categories`, {
    headers: bearer(token),
    data: [{ name, scaleMin: 1, scaleMax: 10 }],
  });
  expect(saved.ok()).toBeTruthy();
  const categories: { id: string | number; name: string }[] = await (
    await request.get(`${API_APP}/evaluation_categories`, { headers: bearer(token) })
  ).json();
  const category = categories.find((c) => c.name === name);
  expect(category, "the new category was saved").toBeTruthy();
  // One score for one student, so the impact reads 1 score across 1 player.
  const studentId = await playerIdByName(request, token, "E2E Student");
  const scored = await request.post(`${API_APP}/add_evaluation_entry`, {
    headers: bearer(token),
    data: { playerId: studentId, scores: [{ categoryId: String(category!.id), value: 5 }], strengths: [], weaknesses: [] },
  });
  expect(scored.ok()).toBeTruthy();

  await loginAsCoach(page);
  await openSettings(page);
  const del = page.getByRole("button", { name: new RegExp(`^(delete category|eliminar categoria) ${name}$`, "i") });
  await expect(del).toBeVisible({ timeout: 10_000 });
  await del.click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByTestId("evaluation-category-impact")).toContainText(/\b1\b\D+\b1\b/, { timeout: 10_000 });
  const confirm = dialog.getByTestId("evaluation-category-delete-confirm");
  const typed = dialog.getByTestId("evaluation-category-delete-name");
  await expect(confirm).toBeDisabled();
  await typed.fill(name.toUpperCase());
  await expect(confirm).toBeDisabled();
  await typed.fill(name);
  await expect(confirm).toBeEnabled();

  const deleted = page.waitForResponse((r) => r.url().includes("/delete/evaluation_category"));
  await confirm.click();
  expect((await deleted).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  await expect(del).toHaveCount(0);

  const after = await request.get(`${API_APP}/evaluation_category/${category!.id}/impact`, { headers: bearer(token) });
  expect(after.status()).toBe(404);
});

test("PAD-274: a category added in the form but never saved is removed without asking", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  const deletes = page.getByTestId("evaluation-category-delete");
  await expect(deletes.first()).toBeVisible({ timeout: 10_000 });
  const before = await deletes.count();

  const calls: string[] = [];
  page.on("request", (r) => {
    if (/\/delete\/evaluation_category|\/evaluation_category\/\d+\/impact/.test(r.url())) calls.push(r.url());
  });

  await page.getByRole("button", { name: /^(add category|adicionar categoria)$/i }).click();
  await expect(deletes).toHaveCount(before + 1);
  await deletes.last().click();
  await expect(deletes).toHaveCount(before);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("PAD-274: a category saved in this form asks before it is deleted, without a reload", async ({ page }) => {
  await loginAsCoach(page);
  await openSettings(page);
  const deletes = page.getByTestId("evaluation-category-delete");
  await expect(deletes.first()).toBeVisible({ timeout: 10_000 });

  const name = `E2E Saved Cat ${Date.now().toString().slice(-6)}`;
  await page.getByRole("button", { name: /^(add category|adicionar categoria)$/i }).click();
  await page.getByRole("textbox", { name: /^(name|nome)$/i }).last().fill(name);
  const saved = page.waitForResponse((r) => r.url().includes("/add_evaluation_categories"));
  const reloaded = page.waitForResponse(
    (r) => r.url().includes("/evaluation_categories") && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: /^(save categories|guardar categorias)$/i }).click();
  expect((await saved).status()).toBe(200);
  await reloaded;

  // Before PAD-274 the row kept its temporary id after the save; its delete
  // either 400'd (web) or only dropped it from the screen (iOS).
  await page.getByRole("button", { name: new RegExp(`^(delete category|eliminar categoria) ${name}$`, "i") }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByTestId("evaluation-category-impact")).toContainText(/\b0\b\D+\b0\b/, { timeout: 10_000 });
  await dialog.getByTestId("evaluation-category-delete-name").fill(name);
  const deleted = page.waitForResponse((r) => r.url().includes("/delete/evaluation_category"));
  await dialog.getByTestId("evaluation-category-delete-confirm").click();
  expect((await deleted).status()).toBe(200);
  await expect(dialog).toHaveCount(0);
});
