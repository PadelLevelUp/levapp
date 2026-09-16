/**
 * PAD-232 — the "Request alerts" switch (notifications.request-alerts rule 6)
 * persists through PATCH /api/auth/me and survives a reload.
 *
 * The switch is restored to ON at the end so later specs see the seed state.
 *
 * Run a single test:
 *   npx playwright test e2e/settings/request-alerts-optout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_AUTH } from "../helpers/api";

async function openPreferences(page: Page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: /^(preferences|preferências)$/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /^(preferences|preferências)$/i })
  ).toBeVisible({ timeout: 5000 });
}

test("PAD-232: switching request alerts off persists and reloads off", async ({ page, request }) => {
  await loginAsCoach(page);
  await openPreferences(page);

  const toggle = page.getByTestId("settings-request-alerts");
  await expect(toggle).toBeVisible({ timeout: 5000 });
  await expect(toggle).toBeEnabled({ timeout: 5000 });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH" && r.status() === 200,
      { timeout: 10_000 }
    ),
    toggle.click(),
  ]);
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await openPreferences(page);
  const after = page.getByTestId("settings-request-alerts");
  await expect(after).toBeEnabled({ timeout: 5000 });
  await expect(after).toHaveAttribute("aria-checked", "false");

  // The server agrees.
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const token = (await login.json()).accessToken ?? (await login.json()).access_token;
  const me = await request.get(`${API_AUTH}/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await me.json()).requestAlerts).toBe(false);

  // Restore for later specs.
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH" && r.status() === 200,
      { timeout: 10_000 }
    ),
    after.click(),
  ]);
  await expect(after).toHaveAttribute("aria-checked", "true");
});
