import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";

// players.profile rule 11 (PAD-834): a pending player's profile (the placeholder, not "Ghost Player",
// which delete-player.spec.ts deletes) shows the chip and the alert, reads "Preenchido no registo"
// for its empty e-mail, offers no share/SMS/e-mail control, and copies the activation link
// (assumption Q6). The day arithmetic of "há X dias" is PLAYERS-LIST-18's alone.

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("[PLAYERS-PROFILE-14] the pending profile copies the activation link and offers no other send", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const token = await coachToken(request);
  const created = await request.post(`${API_APP}/add_player`, {
    headers: bearer(token),
    data: { name: `E2E Pending ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const { playerId, userId } = await created.json();

  try {
    await loginAsCoach(page);
    await page.goto(`/players/${playerId}`);

    const alert = page.getByTestId("player-pending-alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("player-chip-pending")).toBeVisible();
    await expect(alert.getByTestId("player-pending-age")).toHaveAttribute("data-days", "0");
    await expect(page.getByTestId("player-info-email")).toHaveText(ui("players.card.emailAtRegistration"));
    await expect(page.getByTestId("player-share-register-link")).toHaveCount(0);
    await expect(page.getByTestId("player-register-link")).toHaveCount(0);

    await alert.getByTestId("player-copy-invite-link").click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(new RegExp(`/register/${userId}\\?t=[0-9a-f]{64}$`));

    // The link opens the registration form for that player.
    const path = new URL(copied).pathname + new URL(copied).search;
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/register/${userId}`));
    await expect(page.getByTestId("register-country")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("register-invalid")).toHaveCount(0);
  } finally {
    await request.post(`${API_APP}/remove_player`, { headers: bearer(token), data: { playerId, action: "delete" } });
  }
});
