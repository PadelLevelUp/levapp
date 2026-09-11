import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-274 / players.remove (B-057). A coach DISCONNECTS from a student who has
// an account, and can never delete them; a coach DELETES only a placeholder
// they created that no one has claimed. The app renders in Portuguese under
// Playwright, so copy is matched in both languages.

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

test("PAD-274: a student with an account offers Disconnect, shows what goes, and cannot be deleted", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const studentId = await playerIdByName(request, token, "E2E Student");

  // The API refuses a delete outright, and nothing changes.
  const refused = await request.post(`${API_APP}/remove_player`, {
    headers: bearer(token),
    data: { playerId: studentId, action: "delete" },
  });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).code).toBe("PLAYER_HAS_ACCOUNT");
  const impact = await request.get(`${API_APP}/player/${studentId}/removal_impact`, { headers: bearer(token) });
  expect(impact.status()).toBe(200);
  expect((await impact.json()).action).toBe("disconnect");

  await loginAsCoach(page);
  await page.goto(`/players/${studentId}`);
  const disconnect = page.getByRole("button", { name: /^(disconnect|desassociar)$/i });
  await expect(disconnect).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^(delete player|eliminar jogador)$/i })).toHaveCount(0);

  await disconnect.click();
  const dialog = page.getByRole("alertdialog");
  // Notes and evaluations; no attendance line, because attendance stays.
  await expect(dialog.getByTestId("player-removal-impact").getByRole("listitem")).toHaveCount(2, { timeout: 10_000 });
  await expect(dialog.getByTestId("player-remove-confirm")).toHaveText(/disconnect|desassociar/i);

  // Cancel: this spec never removes the seeded student.
  await dialog.getByRole("button", { name: /^(cancel|cancelar)$/i }).click();
  await expect(dialog).toHaveCount(0);
});

test("PAD-274: a placeholder the coach created offers Delete and is deleted", async ({ page, request }) => {
  const token = await coachToken(request);
  const name = `E2E Removal Placeholder ${Date.now()}`;
  const created = await request.post(`${API_APP}/add_player`, { headers: bearer(token), data: { name } });
  expect(created.ok()).toBeTruthy();
  const placeholderId = String((await created.json()).playerId);

  await loginAsCoach(page);
  await page.goto(`/players/${placeholderId}`);
  const del = page.getByRole("button", { name: /^(delete player|eliminar jogador)$/i });
  await expect(del).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^(disconnect|desassociar)$/i })).toHaveCount(0);

  await del.click();
  const dialog = page.getByRole("alertdialog");
  // Notes, evaluations and attendance: a delete takes the record's presences too.
  await expect(dialog.getByTestId("player-removal-impact").getByRole("listitem")).toHaveCount(3, { timeout: 10_000 });

  const removed = page.waitForResponse(
    (r) => r.url().includes("/remove_player") && r.request().method() === "POST",
  );
  await dialog.getByTestId("player-remove-confirm").click();
  const res = await removed;
  expect(res.status()).toBe(200);
  expect(JSON.parse(res.request().postData() ?? "{}").action).toBe("delete");
  await page.waitForURL(/\/players$/, { timeout: 10_000 });

  // Gone from the roster: the impact now refuses (no link left to this coach).
  const after = await request.get(`${API_APP}/player/${placeholderId}/removal_impact`, { headers: bearer(token) });
  expect(after.status()).toBe(403);
});
