import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";
import { appWeeksAhead, pinBrowserToE2eToday, seedAcademyMonday } from "../helpers/app-week";

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

// players.profile rule 11 (PAD-834): a pending player is evaluated and taken to classes like anyone.
// The evaluation is saved for real; the class part proves the header's picker offers the seeded
// class as selectable for the placeholder. Enrolling is the existing PLAYERS-PROFILE-3 path and,
// for a level-less placeholder, may first ask the eligibility confirmation, which this test does
// not drive. Everything is undone by deleting the placeholder (its presences and records go with it).
test("[PLAYERS-PROFILE-20] a pending player can be evaluated and added to a class", async ({ page, request }) => {
  const token = await coachToken(request);
  const created = await request.post(`${API_APP}/add_player`, {
    headers: bearer(token),
    data: { name: `E2E Pending Eval ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const { playerId } = await created.json();

  try {
    await pinBrowserToE2eToday(page);
    await loginAsCoach(page);
    await page.goto(`/players/${playerId}`);
    await expect(page.getByTestId("player-pending-alert")).toBeVisible({ timeout: 10_000 });

    // Block 2: "Fazer primeira avaliação" opens the drawer's form; one star saves the record.
    await page.getByTestId("profile-evaluations-first").click();
    const form = page.getByTestId("evaluation-form");
    await expect(form).toBeVisible({ timeout: 10_000 });
    const saved = page.waitForResponse((r) => /\/evaluation_record/.test(r.url()) && r.request().method() === "PUT" && r.status() < 400);
    await form.getByTestId(/^evaluation-star-\d+-4$/).first().click();
    await saved;
    await page.getByTestId("evaluation-finish").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("profile-evaluation-last")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("player-pending-alert")).toBeVisible();

    // The header's "Adicionar a aulas" offers the seeded class, selectable.
    await page.getByTestId("player-add-to-classes").click();
    const dialog = page.getByTestId("add-to-classes-dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    for (let i = appWeeksAhead(seedAcademyMonday()); i > 0; i--) {
      await dialog.getByTestId("add-to-classes-next-week").click();
    }
    const firstClass = dialog.locator('[data-testid^="add-to-classes-class-"]:not([disabled])').first();
    await expect(firstClass).toBeVisible({ timeout: 10_000 });
    await firstClass.click();
    await expect(dialog.getByTestId("add-to-classes-footer").getByRole("button").last()).toBeEnabled();
  } finally {
    await request.post(`${API_APP}/remove_player`, { headers: bearer(token), data: { playerId, action: "delete" } });
  }
});
