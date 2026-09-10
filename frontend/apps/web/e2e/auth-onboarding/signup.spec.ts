import { test, expect, type Page } from "@playwright/test";
import { COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { completeEmailVerification } from "../helpers/emailVerification";

/**
 * auth.register + auth.coach-approval (PAD-210).
 *
 * The seeded `e2e-coach` is `is_superadmin=True` (e2e/scripts/seed.py), so it
 * doubles as the LevApp admin here. Usernames carry a timestamp so a re-run
 * never trips the uniqueness rules.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

/**
 * Fills the form and submits. Unless `verify` is false the email code step
 * that follows every successful signup (auth.email-verification rule 8) is
 * completed too, so the caller lands where PAD-210 expected.
 */
async function signUp(page: Page, role: "coach" | "student", username: string, verify = true) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.getByTestId("auth-create-account").click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByTestId(`signup-role-${role}`).click();
  await page.locator("#signup-name").fill(`E2E ${role} ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  // PAD-198: birth date is required at sign-up; an adult in Portugal (the default country).
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-submit").click();
  if (verify) await completeEmailVerification(page);
}

async function signIn(page: Page, username: string, password: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 10_000 });
}

async function signOutFromHoldingScreen(page: Page) {
  await page.getByTestId("coach-pending-signout").click();
  await expect(page).toHaveURL(/\/auth$/);
}

test("US-210: student signs up and lands on Connect with a coach", async ({ page }) => {
  const username = `e2e-signup-s-${stamp()}`;
  await signUp(page, "student", username);
  await expect(page).toHaveURL(/\/connect$/, { timeout: 15_000 });
  await expect(page.getByTestId("connect-with-coach")).toBeVisible();
});

test("US-225: a too-short username is reported under its field before any request", async ({
  page,
}) => {
  let registerCalls = 0;
  page.on("request", (req) => {
    if (/\/api\/auth\/register$/.test(req.url()) && req.method() === "POST") registerCalls += 1;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill("E2E Short");
  await page.locator("#signup-username").fill("a");
  await page.locator("#signup-email").fill(`short-${stamp()}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  // PAD-198: birth date is required at sign-up; an adult in Portugal (the default country).
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-submit").click();

  await expect(page.getByTestId("signup-username-error")).toContainText(/3 characters|3 caracteres/i);
  await expect(page).toHaveURL(/\/signup$/);
  expect(registerCalls).toBe(0);
});

test("US-210: taken username is reported under the field", async ({ page }) => {
  await signUp(page, "student", COACH_USERNAME, false);
  await expect(page.getByTestId("signup-username-error")).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/signup$/);
});

test("US-210: coach signs up, waits for approval, then reaches club onboarding once approved", async ({
  browser,
  page,
}) => {
  const username = `e2e-signup-c-${stamp()}`;

  // 1. Coach signs up → pending screen, with no club form anywhere.
  await signUp(page, "coach", username);
  await expect(page).toHaveURL(/\/coach-pending$/, { timeout: 15_000 });
  await expect(page.getByTestId("coach-pending")).toBeVisible();
  await expect(page.getByTestId("club-onboarding")).toHaveCount(0);

  // 2. Signing out and back in still lands on the pending screen.
  await signOutFromHoldingScreen(page);
  await signIn(page, username, PASSWORD);
  await expect(page).toHaveURL(/\/coach-pending$/);
  // A coach route is closed while pending.
  await page.goto("/players");
  await expect(page).toHaveURL(/\/coach-pending$/);
  await signOutFromHoldingScreen(page);

  // 3. The LevApp admin approves in Settings → Admin (separate session).
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, COACH_USERNAME, COACH_PASSWORD);
  await admin.goto("/settings");
  await admin.getByTestId("settings-nav-admin").click();
  await expect(admin.getByTestId(`admin-pending-${username}`)).toBeVisible({ timeout: 10_000 });
  await admin.getByTestId(`admin-approve-${username}`).click();
  await expect(admin.getByTestId(`admin-pending-${username}`)).toHaveCount(0, { timeout: 10_000 });
  await adminContext.close();

  // 4. The approved coach now lands on club onboarding.
  await signIn(page, username, PASSWORD);
  await expect(page).toHaveURL(/\/club-onboarding$/, { timeout: 15_000 });
  await expect(page.getByTestId("club-onboarding")).toBeVisible();
});

test("US-210: a non-superadmin never sees the Admin section", async ({ page }) => {
  const username = `e2e-signup-s2-${stamp()}`;
  await signUp(page, "student", username);
  await expect(page).toHaveURL(/\/connect$/, { timeout: 15_000 });
  await page.goto("/settings");
  await expect(page.getByTestId("settings-nav-preferences")).toBeVisible();
  await expect(page.getByTestId("settings-nav-admin")).toHaveCount(0);
});
