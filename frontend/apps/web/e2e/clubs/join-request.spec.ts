import { test, expect, type Page } from "@playwright/test";
import { COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";

/**
 * clubs.join-request (PAD-211).
 *
 * An approved coach with no club picks one on the club-onboarding screen:
 * ask to join an existing club (a member approves in Settings → Club) or
 * create their own. The seeded `e2e-coach` is both the LevApp superadmin who
 * approves the new coach and a member of the seeded "E2E Club" who approves
 * the join request. Usernames carry a timestamp so re-runs never collide.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";
const SEEDED_CLUB = "E2E Club";

async function signUpCoach(page: Page, username: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.getByTestId("auth-create-account").click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByTestId("signup-role-coach").click();
  await page.locator("#signup-name").fill(`E2E coach ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/coach-pending$/, { timeout: 15_000 });
  await page.getByTestId("coach-pending-signout").click();
  await expect(page).toHaveURL(/\/auth$/);
}

async function signIn(page: Page, username: string, password: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 10_000 });
}

/** The LevApp admin approves the coach in Settings → Admin (own session). */
async function adminApprovesCoach(page: Page, username: string) {
  await signIn(page, COACH_USERNAME, COACH_PASSWORD);
  await page.goto("/settings");
  await page.getByTestId("settings-nav-admin").click();
  await expect(page.getByTestId(`admin-pending-${username}`)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId(`admin-approve-${username}`).click();
  await expect(page.getByTestId(`admin-pending-${username}`)).toHaveCount(0, { timeout: 10_000 });
}

/** Signs up a coach and gets them approved; resolves once they sit on club onboarding. */
async function approvedCoachOnOnboarding(page: Page, adminPage: Page, username: string) {
  await signUpCoach(page, username);
  await adminApprovesCoach(adminPage, username);
  await signIn(page, username, PASSWORD);
  await expect(page).toHaveURL(/\/club-onboarding$/, { timeout: 15_000 });
  await expect(page.getByTestId("club-onboarding")).toBeVisible();
}

test("US-211: approved coach asks to join the seeded club and a member approves", async ({
  browser,
  page,
}) => {
  const username = `e2e-join-c-${stamp()}`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await approvedCoachOnOnboarding(page, admin, username);

  // 1. Two paths are offered; take "Join an existing club" and search.
  await expect(page.getByTestId("club-onboarding-create")).toBeVisible();
  await page.getByTestId("club-onboarding-join").click();
  await page.getByTestId("club-search-input").fill("e2e");
  const result = page
    .getByTestId("club-search-results")
    .locator("li", { hasText: SEEDED_CLUB })
    .locator('[data-testid^="club-search-result-"]')
    .first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  // 2. Pending state: club name, Withdraw, and "Create my own club instead".
  await expect(page.getByTestId("club-onboarding-pending")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("club-onboarding-pending")).toContainText(SEEDED_CLUB);
  await expect(page.getByTestId("club-onboarding-withdraw")).toBeVisible();
  await expect(page.getByTestId("club-onboarding-create-instead")).toBeVisible();
  // A coach route is still closed while the request is pending.
  await page.goto("/players");
  await expect(page).toHaveURL(/\/club-onboarding$/);

  // 3. A member of the club approves it in Settings → Club.
  await admin.goto("/settings");
  await admin.getByTestId("settings-nav-club").click();
  const request = admin
    .locator('[data-testid^="club-join-request-"]')
    .filter({ hasText: `E2E coach ${username}` })
    .first();
  await expect(request).toBeVisible({ timeout: 10_000 });
  const requestId = (await request.getAttribute("data-testid"))!.replace("club-join-request-", "");
  await admin.getByTestId(`club-join-approve-${requestId}`).click();
  await expect(admin.getByTestId(`club-join-request-${requestId}`)).toHaveCount(0, {
    timeout: 10_000,
  });
  await adminContext.close();

  // 4. The coach is now a member: a reload lands on the dashboard.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByTestId("club-onboarding")).toHaveCount(0);
});

test("US-211: approved coach with no club creates one and reaches the dashboard", async ({
  browser,
  page,
}) => {
  const username = `e2e-create-c-${stamp()}`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await approvedCoachOnOnboarding(page, admin, username);
  await adminContext.close();

  await page.getByTestId("club-onboarding-create").click();
  await page.getByTestId("club-create-name").fill(`Clube ${username}`);
  await page.getByTestId("club-create-location").fill("Porto");
  await page.getByTestId("club-create-submit").click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  // Membership is real: the coach route is open and Settings → Club shows the new club.
  await page.goto("/settings");
  await page.getByTestId("settings-nav-club").click();
  await expect(page.getByText(`Clube ${username}`)).toBeVisible({ timeout: 10_000 });
});
