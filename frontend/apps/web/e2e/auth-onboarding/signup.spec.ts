import { test, expect, type Page } from "@playwright/test";
import { COACH_USERNAME } from "../helpers/auth";
import { approveCoachInDb } from "../helpers/coachApproval";
import { completeEmailVerification } from "../helpers/emailVerification";

/**
 * auth.register + auth.coach-approval (PAD-210).
 *
 * Approval moved to the staff console (PAD-532), so the spec sets the approved
 * state in the E2E database (helpers/coachApproval.ts). Usernames carry a
 * timestamp so a re-run never trips the uniqueness rules.
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
  // PAD-485 (auth.register rule 19): the Terms box is required.
  await page.getByTestId("signup-terms").click();
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
  // PAD-485 (auth.register rule 19): the Terms box is required.
  await page.getByTestId("signup-terms").click();
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

  // 3. The staff console approves (PAD-532): set the same state in the E2E database.
  approveCoachInDb(username);

  // 4. The approved coach now lands on club onboarding.
  await signIn(page, username, PASSWORD);
  await expect(page).toHaveURL(/\/club-onboarding$/, { timeout: 15_000 });
  await expect(page.getByTestId("club-onboarding")).toBeVisible();
});

// PAD-485 (auth.register rule 19): the Terms box is required; unticked, nothing is sent; ticked, the
// request says so, and the declared capability makes the server hold the client to it.
test("PAD-485: a sign-up cannot be sent until the Terms are accepted", async ({ page }) => {
  const username = `e2e-terms-${stamp()}`;
  let registerCalls = 0;
  page.on("request", (req) => {
    if (/\/api\/auth\/register$/.test(req.url()) && req.method() === "POST") registerCalls += 1;
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill("E2E Terms");
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await expect(page.locator('label[for="signup-terms"] a[href="/privacy"]')).toBeVisible();
  await expect(page.locator('label[for="signup-terms"] a[href="/terms"]')).toBeVisible();

  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("signup-terms-error")).toBeVisible();
  expect(registerCalls).toBe(0);

  await page.getByTestId("signup-terms").click();
  await expect(page.getByTestId("signup-terms-error")).toBeHidden();
  const sent = page.waitForRequest((r) => /\/api\/auth\/register$/.test(r.url()) && r.method() === "POST");
  await page.getByTestId("signup-submit").click();
  const request = await sent;
  expect(request.postDataJSON()).toMatchObject({ termsAccepted: true });
  expect(request.headers()["x-levapp-capabilities"]).toContain("terms-acceptance");
  expect((await request.response())?.status()).toBe(201);
  await completeEmailVerification(page);
});
