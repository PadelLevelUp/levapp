import { test, expect, type Page } from "@playwright/test";
import { API_AUTH } from "../helpers/api";

/**
 * auth.parental-consent (PAD-198). The E2E backend runs with
 * E2E_DEBUG_ENDPOINTS on, so the guardian's mails land in the in-process
 * outbox and a flag-gated route hands back the consent and withdraw tokens.
 * Portugal is the default country (age of digital consent 13).
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";
const minorBirth = () => `${new Date().getFullYear() - 10}-01-01`;

async function mailedTokens(page: Page, email: string) {
  const res = await page.request.get(`${API_AUTH}/guardian-consent/debug/last-link?email=${encodeURIComponent(email)}`);
  expect(res.ok(), `debug last-link answered ${res.status()}`).toBeTruthy();
  return (await res.json()) as { consentToken: string | null; revokeToken: string | null };
}

async function signIn(page: Page, username: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
}

test("US-198: a minor signs up, the guardian consents and later withdraws", async ({ page }) => {
  const username = `e2e-minor-${stamp()}`;
  const guardian = `g-${username}@example.com`;

  // Sign-up: the guardian field appears for a 10-year-old in Portugal.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(`E2E Minor ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await expect(page.getByTestId("signup-guardian")).toHaveCount(0);
  await page.locator("#signup-birthDate").fill(minorBirth());
  await expect(page.getByTestId("signup-guardian")).toBeVisible();
  await page.locator("#signup-guardianEmail").fill(guardian);
  await page.getByTestId("signup-submit").click();

  // No session: the waiting card, not the app.
  await expect(page.getByTestId("guardian-pending")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("guardian-pending-email")).toContainText("@example.com");
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByTestId("guardian-pending-resend")).toBeDisabled();

  // Signing in before consent shows the same card.
  await signIn(page, username);
  await expect(page.getByTestId("guardian-pending")).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/auth$/);

  // The guardian consents from the emailed link.
  const { consentToken } = await mailedTokens(page, guardian);
  expect(consentToken).toBeTruthy();
  await page.goto(`/guardian-consent/${consentToken}`);
  await expect(page.getByTestId("consent-minor")).toContainText(username);
  await page.locator("#consent-guardianName").fill("Maria E2E");
  await page.getByTestId("consent-relationship-parent").click();
  await page.getByTestId("consent-confirm-minor").click();
  await page.getByTestId("consent-accept-terms").click();
  await page.getByTestId("consent-submit").click();
  await expect(page.getByTestId("consent-done")).toBeVisible({ timeout: 10_000 });

  // Reopening the link says it was already answered.
  await page.goto(`/guardian-consent/${consentToken}`);
  await expect(page.getByTestId("consent-decided")).toBeVisible();

  // The minor gets in — to the email code screen first.
  await signIn(page, username);
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 15_000 });

  // The guardian withdraws: the page states the removal is irreversible.
  await page.evaluate(() => localStorage.clear());
  const { revokeToken } = await mailedTokens(page, guardian);
  expect(revokeToken).toBeTruthy();
  await page.goto(`/guardian-consent/revoke/${revokeToken}`);
  await expect(page.getByTestId("revoke-warning")).toBeVisible();
  await page.getByTestId("revoke-confirm").click();
  await expect(page.getByTestId("revoke-done")).toBeVisible({ timeout: 10_000 });

  // The minor can no longer sign in.
  await signIn(page, username);
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.locator("text=/inválid|invalid/i").first()).toBeVisible({ timeout: 5_000 });
});

test("US-198: an unknown consent link says it is no longer valid", async ({ page }) => {
  await page.goto("/guardian-consent/not-a-real-token-at-all-0000000000");
  await expect(page.getByTestId("consent-expired")).toBeVisible({ timeout: 10_000 });
});
