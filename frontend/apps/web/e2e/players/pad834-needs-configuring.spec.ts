import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// players.profile rule 9 (PAD-834): a player with no level or no side says what is missing, and
// "Completar informação" opens Block 1 with focus on the first missing select; the alert holds no
// select and leaves once the save has both. By test id and data attributes, never copy. Each test
// creates its own player and deletes it (R-040).

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("[PLAYERS-PROFILE-13] names what is missing, completes through Informação, and the alert leaves on save", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  const created = await request.post(`${API_APP}/add_player`, {
    headers: bearer(token),
    data: { name: `E2E Unset ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const playerId = String((await created.json()).playerId);

  try {
    await loginAsCoach(page);
    await page.goto(`/players/${playerId}`);

    const alert = page.getByTestId("player-needs-config-alert");
    await expect(alert).toHaveAttribute("data-missing", "level,side", { timeout: 10_000 });
    await expect(page.getByTestId("player-chip-no-level")).toBeVisible();
    await expect(page.getByTestId("player-chip-no-side")).toBeVisible();
    await expect(page.getByTestId("player-info-level-unset")).toBeVisible();
    await expect(page.getByTestId("player-info-side-unset")).toBeVisible();
    await expect(alert.getByRole("combobox")).toHaveCount(0);

    await page.getByTestId("player-needs-config-complete").click();
    await expect(page.getByTestId("player-info-card")).toHaveAttribute("data-editing", "complete");
    await expect(page.getByTestId("player-level-select")).toBeFocused();
    const save = page.getByTestId("player-info-save");
    await expect(save).toBeDisabled();

    await page.getByTestId("player-level-select").click();
    await page.getByRole("option").first().click();
    await expect(save).toBeDisabled(); // the side is still missing
    await page.getByTestId("player-side-select").click();
    await page.getByRole("option").first().click();
    await expect(save).toBeEnabled();

    const answered = page.waitForResponse((r) => r.url().endsWith("/edit_player") && r.request().method() === "POST");
    await save.click();
    expect((await answered).status()).toBe(200);

    await expect(alert).toHaveCount(0);
    await expect(page.getByTestId("player-chip-no-level")).toHaveCount(0);
    await expect(page.getByTestId("player-chip-no-side")).toHaveCount(0);
    await expect(page.getByTestId("player-info-level-unset")).toHaveCount(0);
  } finally {
    await request.post(`${API_APP}/remove_player`, { headers: bearer(token), data: { playerId, action: "delete" } });
  }
});
