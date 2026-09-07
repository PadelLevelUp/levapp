import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * players.claim (PAD-213) — a coach-created record is folded into the account
 * the student made on their own, instead of the database keeping two people.
 *
 *   US-213a: trigger B — the coach asks by exact username, the student accepts
 *            from the dashboard banner; the coach's level survives, the
 *            placeholder disappears.
 *   US-213b: trigger A — the signed-in student opens the invite link and links
 *            the record to their own account.
 *
 * Timestamps keep every name and username unique across re-runs. The presence
 * half of the spec's first criterion is not exercised here: marking a presence
 * needs a class the placeholder is enrolled in, which is several screens away
 * from this flow — the merge of presences is pinned by the backend tests.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

/** Signs a brand-new student up in `page` and returns their username / display name. */
async function signUpStudent(page: Page) {
  const username = `e2e-claim-s-${stamp()}`;
  const displayName = `E2E student ${username}`;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.getByTestId("auth-create-account").click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(displayName);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/connect$/, { timeout: 15_000 });
  return { username, displayName };
}

/**
 * As the seeded coach: create a pending (claimable) player through the
 * "Create & invite" path and return the invite link plus the placeholder name.
 * Mirrors player-invite-completion.spec.ts.
 */
async function createClaimablePlayer(page: Page) {
  const placeholderName = `Claimable ${stamp()}`;
  await loginAsCoach(page);
  await openPlayers(page);
  await page.getByRole("button", { name: /add player/i }).first().click();
  await page.getByLabel(/^name$/i).fill(placeholderName);
  await page.getByRole("button", { name: /create.*invite|invite.*player/i }).click();
  const dialog = page.getByRole("dialog", { name: /invite/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  const link = await dialog.getByRole("textbox").inputValue();
  expect(link).toContain("/invite/player/");
  await page.keyboard.press("Escape");
  return { placeholderName, link };
}

/** Open a player's detail page from the roster by (exact) name. */
async function openPlayerDetail(page: Page, name: string) {
  await openPlayers(page);
  await page.getByPlaceholder(/search/i).first().fill(name);
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 10_000 });
}

/** Set the level to Intermediate through the header's inline edit. */
async function setLevelIntermediate(page: Page) {
  await page.getByRole("button", { name: "Edit" }).first().click({ timeout: 5000 });
  await page.locator('[role="combobox"]').nth(1).click();
  await page.getByRole("option", { name: /Intermediate/i }).click();
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/I1\s*\|\s*Intermediate/).first()).toBeVisible({ timeout: 5000 });
}

async function rosterHas(page: Page, name: string, expected: boolean) {
  await openPlayers(page);
  await page.getByPlaceholder(/search/i).first().fill(name);
  const row = page.getByText(name, { exact: true });
  if (expected) {
    await expect(row.first()).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  }
}

test.describe("players.claim", () => {
  let studentContext: BrowserContext;

  test.afterEach(async () => {
    await studentContext?.close().catch(() => undefined);
  });

  test("US-213a: coach asks by username, the student accepts, the record is merged with its level", async ({
    page,
    browser,
  }) => {
    // 1. The coach creates a claimable record and gives it a level.
    const { placeholderName } = await createClaimablePlayer(page);
    await openPlayerDetail(page, placeholderName);
    await setLevelIntermediate(page);

    // 2. A student registers on their own, unaware of the record.
    studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    const { username, displayName } = await signUpStudent(student);

    // 3. The coach links the record to that username.
    await page.reload();
    await page.waitForURL(/\/players\/\d+/, { timeout: 10_000 });
    await page.getByTestId("player-claim-link").click();
    await page.getByTestId("player-claim-username").fill(username);
    await page.getByTestId("player-claim-submit").click();
    await expect(page.getByTestId("player-claim-pending")).toBeVisible({ timeout: 10_000 });

    // 4. The student sees the request on the dashboard and accepts it.
    await student.goto("/dashboard");
    const banner = student.getByTestId("claim-request-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(placeholderName);
    await student.locator('[data-testid^="claim-accept-"]').first().click();
    await expect(student.getByTestId("claim-request-banner")).toHaveCount(0, { timeout: 15_000 });

    // 5. The coach's roster now shows the student's real name, with the level
    //    the coach set, and the placeholder is gone.
    await rosterHas(page, placeholderName, false);
    await rosterHas(page, displayName, true);
    await openPlayerDetail(page, displayName);
    await expect(page.getByText(/I1\s*\|\s*Intermediate/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("player-claim-link")).toHaveCount(0);
  });

  test("US-213b: the signed-in student opens the invite link and links the record", async ({
    page,
    browser,
  }) => {
    const { placeholderName, link } = await createClaimablePlayer(page);
    const token = link.split("/invite/player/")[1];

    studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    const { displayName } = await signUpStudent(student);

    await student.goto(`/invite/player/${token}`);
    await expect(student.getByTestId("invite-claim")).toBeVisible({ timeout: 10_000 });
    await student.getByTestId("invite-claim-confirm").click();
    await expect(student.getByTestId("invite-claim-success")).toBeVisible({ timeout: 15_000 });

    // The link is single-use: opening it again is the invalid state.
    await student.goto(`/invite/player/${token}`);
    await expect(student.getByTestId("invite-claim")).toHaveCount(0);

    await rosterHas(page, placeholderName, false);
    await rosterHas(page, displayName, true);
  });

  test("US-213c: signed-out invite page offers sign-in-to-link and comes back", async ({
    page,
    browser,
  }) => {
    const { link } = await createClaimablePlayer(page);
    const token = link.split("/invite/player/")[1];

    studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    const { username } = await signUpStudent(student);
    // Sign out by dropping the session, then come back through the invite.
    await student.evaluate(() => localStorage.clear());
    await student.goto(`/invite/player/${token}`);
    await student.getByTestId("invite-claim-signin").click();
    await expect(student).toHaveURL(/\/auth$/);
    await student.locator("#username").fill(username);
    await student.locator("#password").fill(PASSWORD);
    await student.locator('button[type="submit"]').click();
    await expect(student).toHaveURL(new RegExp(`/invite/player/${token}$`), { timeout: 15_000 });
    await expect(student.getByTestId("invite-claim")).toBeVisible({ timeout: 10_000 });
  });
});
