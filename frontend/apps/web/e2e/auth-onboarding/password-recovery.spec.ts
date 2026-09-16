import { test, expect, type Page } from "@playwright/test";
import { COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_AUTH } from "../helpers/api";

/**
 * auth.password-recovery (PAD-139).
 *
 * The E2E backend runs with E2E_DEBUG_ENDPOINTS on, so the recovery mail lands
 * in the in-process outbox and the flag-gated debug route hands the 6-digit
 * code back by email (auth.email-verification rule 11). The seeded coach's
 * password is put back at the end so the rest of the suite still signs in.
 */
const COACH_EMAIL = "e2e-coach@test.com";
const NEW_PASSWORD = "E2eCoachNew123!";

async function readRecoveryCode(page: Page, email: string): Promise<string> {
  const res = await page.request.get(
    `${API_AUTH}/email-verification/debug/last-code?email=${encodeURIComponent(email)}`,
  );
  expect(res.ok(), `debug last-code route answered ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { code: string }).code;
}

async function requestCode(page: Page, email: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.getByTestId("auth-forgot-password").click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.locator("#recovery-email").fill(email);
  await page.getByTestId("recovery-send").click();
  await expect(page.getByTestId("recovery-code-step")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("recovery-neutral-copy")).toBeVisible();
}

async function submitCode(page: Page, code: string, password: string) {
  const input = page.getByTestId("recovery-code");
  await input.click();
  await input.fill(code);
  await page.locator("#recovery-password").fill(password);
  await page.getByTestId("recovery-submit").click();
}

async function signIn(page: Page, username: string, password: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
}

async function resetPassword(page: Page, from: string, to: string) {
  // Recover again through the API so the seed is intact for later specs.
  const req = await page.request.post(`${API_AUTH}/password-recovery/request`, {
    data: { email: COACH_EMAIL },
  });
  expect(req.ok()).toBeTruthy();
  const code = await readRecoveryCode(page, COACH_EMAIL);
  const res = await page.request.post(`${API_AUTH}/password-recovery/confirm`, {
    data: { email: COACH_EMAIL, code, newPassword: to },
  });
  expect(res.ok(), `restore answered ${res.status()} (from ${from})`).toBeTruthy();
}

test.describe.serial("US-139: password recovery", () => {
  test("US-139: forgot password from the login screen signs the coach in with a new password", async ({ page }) => {
    await requestCode(page, COACH_EMAIL);

    // A wrong code names the attempts left (rule 8).
    const code = await readRecoveryCode(page, COACH_EMAIL);
    const wrong = code === "000000" ? "111111" : "000000";
    await submitCode(page, wrong, NEW_PASSWORD);
    await expect(page.getByTestId("recovery-error")).toContainText("4");

    // The right code and the new password land where a fresh login lands.
    await submitCode(page, code, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.locator("text=/palavra-passe alterada|password changed/i").first()).toBeVisible({ timeout: 5_000 });

    try {
      // Old password refused, new one accepted.
      await page.evaluate(() => localStorage.clear());
      await signIn(page, COACH_USERNAME, COACH_PASSWORD);
      await expect(page).toHaveURL(/\/auth/);
      await expect(page.locator("text=/inválid|invalid/i").first()).toBeVisible({ timeout: 5_000 });

      await signIn(page, COACH_USERNAME, NEW_PASSWORD);
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    } finally {
      await resetPassword(page, NEW_PASSWORD, COACH_PASSWORD);
    }
  });

  test("US-139: an unknown email shows the same code step with no error", async ({ page }) => {
    await requestCode(page, "nobody@example.com");
    await expect(page.getByTestId("recovery-error")).toHaveCount(0);
    // Resend is on a 60-second countdown after a send (rule 8).
    await expect(page.getByTestId("recovery-resend")).toBeDisabled();
    await page.getByTestId("recovery-back").click();
    await expect(page).toHaveURL(/\/auth$/);
  });
});
