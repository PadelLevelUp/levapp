import { test, expect, devices, type Page } from "@playwright/test";

/**
 * PAD-575 (auth.register rule 20) — what a student typed into the sign-up form survives opening
 * the Terms and coming back. On iOS Safari the report is a same-tab trip to /terms and a "back"
 * that returns to an empty form (a back-forward-cache miss, or the SPA remounting the page). The
 * closest model this runner has: the iPhone profile on Chromium, a same-tab navigation to /terms
 * and `page.goBack()`, which remounts the SPA route exactly as the report describes. What it
 * cannot prove: real WebKit bfcache behaviour and iOS tab discarding — the draft in sessionStorage
 * covers both by construction (it survives a tab reload), and the unit test proves the store.
 * Passwords are never stored, so they are the one field expected empty after the trip. Inputs are
 * located by their `id` (the form labels them by `htmlFor`), as the login helper does.
 */

test.use({ ...devices["iPhone 13"], browserName: "chromium" });

const STAMP = Date.now();
const FILLED = {
  name: "Draft Student",
  username: `draft-${STAMP}`,
  email: `draft-${STAMP}@example.com`,
  birthDate: "2001-05-04",
};
const PASSWORD = "Segura123!";

/** Fill every field the draft is expected to carry, plus the passwords and the Terms box. */
async function fillSignup(page: Page) {
  await expect(page.locator("#signup-name")).toBeVisible({ timeout: 15000 });
  await page.locator("#signup-name").fill(FILLED.name);
  await page.locator("#signup-username").fill(FILLED.username);
  await page.locator("#signup-email").fill(FILLED.email);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill(FILLED.birthDate);
  await page.getByTestId("signup-terms").click();
  await expect(page.getByTestId("signup-terms")).toHaveAttribute("data-state", "checked");
}

async function expectRestored(page: Page) {
  await expect(page.locator("#signup-name")).toHaveValue(FILLED.name, { timeout: 15000 });
  await expect(page.locator("#signup-username")).toHaveValue(FILLED.username);
  await expect(page.locator("#signup-email")).toHaveValue(FILLED.email);
  await expect(page.locator("#signup-birthDate")).toHaveValue(FILLED.birthDate);
  await expect(page.getByTestId("signup-terms")).toHaveAttribute("data-state", "checked");
  // Passwords are not persisted on purpose.
  await expect(page.locator("#signup-password")).toHaveValue("");
}

test("PAD-575: the typed form is still there after a same-tab Terms detour and back", async ({ page }) => {
  await page.goto("/signup");
  await fillSignup(page);

  // The detour: same tab, then back — the shape the iPhone report describes.
  await page.goto("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/signup$/);
  await expectRestored(page);
});

test("PAD-575: a full reload of the sign-up tab keeps the draft too (the discarded-tab case)", async ({ page }) => {
  await page.goto("/signup");
  await fillSignup(page);
  await page.reload();
  await expectRestored(page);
  await expect(page.getByTestId("signup-submit")).toBeVisible();
});

test("PAD-575: a successful sign-up removes the draft, so the next student on this tab starts blank", async ({ page }) => {
  await page.goto("/signup");
  await fillSignup(page);
  await page.getByTestId("signup-submit").click();
  // auth.register rules 11 and 14: a brand-new student lands on "Connect with a coach", behind the
  // email-code screen when verification is on (it is, on this stack). The draft is cleared before
  // either navigation.
  await expect(page).toHaveURL(/\/(connect|verify-email)/, { timeout: 20000 });
  const stored = await page.evaluate(() => window.sessionStorage.getItem("levapp.signupDraft"));
  expect(stored).toBeNull();
});
