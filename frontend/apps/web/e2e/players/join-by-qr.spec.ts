import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { completeEmailVerification } from "../helpers/emailVerification";
import { openPlayers } from "../helpers/navigation";

/**
 * players.join-token (PAD-212): the coach's "Add by QR" link, redeemed by a
 * student who does not have an account yet. The signup round-trip is the
 * interesting part — the link must survive "Create account" and bring the
 * new student straight back to the join page.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

const JOIN_URL = /\/join\/coach\/[A-Za-z0-9_-]+$/;

/** Opens "Add by QR" and returns the link it shows. PAD-269: the server keeps only the
 * token's hash, so when a live code exists the dialog offers a new one instead of
 * showing it again (players.join-token rule 7). */
async function readJoinUrl(page: Page): Promise<string> {
  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  const url = page.getByTestId("add-by-qr-url");
  const live = page.getByTestId("add-by-qr-live");
  await expect(url.or(live)).toBeVisible({ timeout: 10_000 });
  if (await live.isVisible()) await page.getByTestId("add-by-qr-new").click();
  await expect(url).toHaveValue(JOIN_URL, { timeout: 10_000 });
  await expect(page.getByTestId("add-by-qr-code")).toBeVisible();
  const value = await url.inputValue();
  await page.keyboard.press("Escape");
  return value;
}

test("US-212: a new student opens the coach's link, signs up, and lands on the roster", async ({
  browser,
  page,
}) => {
  await loginAsCoach(page);
  const joinUrl = await readJoinUrl(page);
  const joinPath = new URL(joinUrl).pathname;

  // A fresh browser context: no session, exactly like a phone that scanned the QR.
  const context = await browser.newContext();
  const student = await context.newPage();
  await student.emulateMedia({ reducedMotion: "reduce" });
  await student.goto(joinPath);
  await expect(student.getByTestId("join-coach-signed-out")).toBeVisible({ timeout: 10_000 });

  await student.getByTestId("join-coach-create-account").click();
  await expect(student).toHaveURL(/\/signup$/);
  const username = `e2e-join-${stamp()}`;
  await student.getByTestId("signup-role-student").click();
  await student.locator("#signup-name").fill(`E2E Join ${username}`);
  await student.locator("#signup-username").fill(username);
  await student.locator("#signup-email").fill(`${username}@example.com`);
  await student.locator("#signup-password").fill(PASSWORD);
  await student.locator("#signup-repeatPassword").fill(PASSWORD);
  // PAD-198: birth date is required at sign-up; an adult in Portugal (the default country).
  await student.locator("#signup-birthDate").fill("2000-01-01");
  await student.getByTestId("signup-submit").click();
  // PAD-234: sign-up now routes through email verification before the
  // destination below. The debug outbox hands back the real code.
  await completeEmailVerification(student);

  // Back on the join page, now signed in — preview, confirm, success.
  await expect(student).toHaveURL(new RegExp(`${joinPath}$`), { timeout: 15_000 });
  await expect(student.getByTestId("join-coach-preview")).toBeVisible({ timeout: 10_000 });
  await student.getByTestId("join-coach-confirm").click();
  await expect(student.getByTestId("join-coach-success")).toBeVisible({ timeout: 10_000 });
  await context.close();

  // The coach's roster lists the new student (rule 11: no level yet).
  await openPlayers(page);
  await page.getByPlaceholder(/search/i).first().fill(username);
  await expect(page.getByText(`E2E Join ${username}`)).toBeVisible({ timeout: 10_000 });
});

test("US-212: a coach account opening the link is told it cannot join", async ({ page }) => {
  await loginAsCoach(page);
  const joinUrl = await readJoinUrl(page);
  await page.goto(new URL(joinUrl).pathname);
  await expect(page.getByTestId("join-coach-is-coach")).toBeVisible({ timeout: 10_000 });
});

test("US-212: reopening Add by QR offers a new code, which retires the previous link", async ({
  browser,
  page,
}) => {
  await loginAsCoach(page);
  const oldUrl = await readJoinUrl(page);

  // players.join-token rule 7 (PAD-269): the live code is not shown again.
  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  await expect(page.getByTestId("add-by-qr-live")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("add-by-qr-live-uses")).toBeVisible();
  await expect(page.getByTestId("add-by-qr-url")).toHaveCount(0);
  await page.getByTestId("add-by-qr-new").click();
  const url = page.getByTestId("add-by-qr-url");
  await expect(url).toHaveValue(JOIN_URL, { timeout: 10_000 });
  await expect(url).not.toHaveValue(oldUrl);
  const newUrl = await url.inputValue();

  // Rule 6: rotating from the QR screen still asks first and retires the code on screen.
  await page.getByTestId("add-by-qr-rotate").click();
  await page.getByTestId("add-by-qr-rotate-confirm").click();
  await expect(url).not.toHaveValue(newUrl, { timeout: 10_000 });
  await expect(url).toHaveValue(JOIN_URL);

  const context = await browser.newContext();
  const visitor = await context.newPage();
  for (const retired of [oldUrl, newUrl]) {
    await visitor.goto(new URL(retired).pathname);
    await expect(visitor.getByTestId("join-coach-invalid")).toBeVisible({ timeout: 10_000 });
  }
  await context.close();
});
