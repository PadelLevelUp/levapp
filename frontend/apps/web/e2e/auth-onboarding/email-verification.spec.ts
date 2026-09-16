import { test, expect, type Page } from "@playwright/test";
import {
  completeEmailVerification,
  readVerificationCode,
  typeVerificationCode,
} from "../helpers/emailVerification";

/**
 * auth.email-verification (PAD-234): the code screen after self-signup.
 * The E2E backend captures mail in an outbox; the debug route hands the code
 * back (rule 11).
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

async function signUpToVerifyScreen(page: Page, username: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(`E2E verify ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  // PAD-198: birth date is required at sign-up; an adult in Portugal (the default country).
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 15_000 });
  await expect(page.getByTestId("verify-email")).toBeVisible();
}

test("US-234: the verify screen holds the newcomer until the code is typed", async ({ page }) => {
  const username = `e2e-verify-${stamp()}`;
  await signUpToVerifyScreen(page, username);
  await expect(page.getByTestId("verify-email-address")).toHaveText(`${username}@example.com`);

  // Held: the app's other routes bounce back here, and a reload stays here.
  await page.goto("/connect");
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/verify-email/);
  await page.reload();
  await expect(page.getByTestId("verify-email")).toBeVisible();

  // A wrong code names the attempts left (rule 5).
  const code = await readVerificationCode(page);
  const wrong = code === "000000" ? "111111" : "000000";
  await typeVerificationCode(page, wrong);
  await expect(page.getByTestId("verify-email-error")).toContainText(/4/);

  // The right one lands the student on Connect with a coach (auth.register rule 11).
  await typeVerificationCode(page, code);
  await expect(page).toHaveURL(/\/connect$/, { timeout: 15_000 });
  await expect(page.getByTestId("connect-with-coach")).toBeVisible();

  // Verified for good: a reload never shows the screen again, and Settings says so.
  await page.reload();
  await expect(page).toHaveURL(/\/connect$/);
  await page.goto("/settings");
  await page.getByTestId("settings-nav-profile").click();
  await expect(page.getByTestId("profile-email-verified")).toBeVisible({ timeout: 10_000 });
});

test("US-250: just registered means a code is in flight — no send request, only a countdown", async ({ page }) => {
  // auth.email-verification rule 8a / B-042: signup already sent the code
  // (rule 6); the screen must not ask for another and must not show the
  // cooldown as an error.
  let sendCalls = 0;
  page.on("request", (req) => {
    if (/\/api\/auth\/email-verification\/send$/.test(req.url()) && req.method() === "POST") sendCalls += 1;
  });
  const username = `e2e-inflight-${stamp()}`;
  await signUpToVerifyScreen(page, username);

  const resend = page.getByTestId("verify-email-resend");
  await expect(resend).toBeDisabled();
  await expect(resend).toContainText(/\d+s/);
  await expect(page.getByTestId("verify-email-hint")).toBeVisible();
  await expect(page.getByTestId("verify-email-error")).toHaveCount(0);
  // Reloading re-hydrates the countdown from /me instead of asking again.
  await page.reload();
  await expect(page.getByTestId("verify-email")).toBeVisible();
  await expect(resend).toBeDisabled();
  await expect(page.getByTestId("verify-email-error")).toHaveCount(0);
  expect(sendCalls).toBe(0);
});

test("US-250: a too-soon resend is a countdown, not an error", async ({ page }) => {
  // auth.email-verification rule 8a / B-042: a 429 carries retryAfterSeconds;
  // the button counts down from it and nothing turns red.
  const username = `e2e-toosoon-${stamp()}`;
  await signUpToVerifyScreen(page, username);

  // Make the button clickable without waiting out the real cooldown: the
  // screen seeds its countdown from /me on load.
  await page.route("**/api/auth/me", async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...body, emailVerificationResendInSeconds: 0 } });
  });
  await page.route("**/api/auth/email-verification/send", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "RESEND_TOO_SOON", retryAfterSeconds: 42 }),
    });
  });
  await page.reload();
  await expect(page.getByTestId("verify-email")).toBeVisible();

  const resend = page.getByTestId("verify-email-resend");
  await expect(resend).toBeEnabled();
  await resend.click();

  await expect(resend).toBeDisabled();
  await expect(resend).toContainText(/4[12]s/);
  await expect(page.getByTestId("verify-email-error")).toHaveCount(0);
  await expect(page.getByTestId("verify-email-hint")).toBeVisible();
});

test("US-234: Send a new code counts down, then replaces the code", async ({ page }) => {
  test.slow(); // waits out the 60 s server cooldown once
  const username = `e2e-resend-${stamp()}`;
  await signUpToVerifyScreen(page, username);

  const resend = page.getByTestId("verify-email-resend");
  await expect(resend).toBeDisabled();
  await expect(resend).toContainText(/\d+s/);
  const first = await readVerificationCode(page);

  await expect(resend).toBeEnabled({ timeout: 70_000 });
  await resend.click();
  await expect(resend).toBeDisabled();
  await expect
    .poll(async () => readVerificationCode(page), { timeout: 10_000 })
    .not.toBe(first);

  // The old code is dead; the new one works.
  await typeVerificationCode(page, first);
  await expect(page.getByTestId("verify-email-error")).toBeVisible();
  const second = await readVerificationCode(page);
  await typeVerificationCode(page, second);
  await expect(page).toHaveURL(/\/connect$/, { timeout: 15_000 });
});

test("US-234: Change email sends a code to the new address", async ({ page }) => {
  const username = `e2e-change-${stamp()}`;
  await signUpToVerifyScreen(page, username);

  await page.getByTestId("verify-email-change").click();
  await page.getByTestId("verify-email-new-address").fill(`${username}-new@example.com`);
  await page.getByTestId("verify-email-save-address").click();
  await expect(page.getByTestId("verify-email-address")).toHaveText(`${username}-new@example.com`, {
    timeout: 10_000,
  });

  await completeEmailVerification(page);
  await expect(page).toHaveURL(/\/connect$/);
});
