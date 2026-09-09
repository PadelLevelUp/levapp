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

async function readJoinUrl(page: Page): Promise<string> {
  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  const url = page.getByTestId("add-by-qr-url");
  await expect(url).toHaveValue(/\/join\/coach\/[A-Za-z0-9_-]+$/, { timeout: 10_000 });
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

test("US-212: generating a new code retires the previous link", async ({ browser, page }) => {
  await loginAsCoach(page);
  const oldUrl = await readJoinUrl(page);

  await openPlayers(page);
  await page.getByTestId("players-add-by-qr").click();
  await expect(page.getByTestId("add-by-qr-url")).toHaveValue(oldUrl, { timeout: 10_000 });
  await page.getByTestId("add-by-qr-rotate").click();
  await page.getByTestId("add-by-qr-rotate-confirm").click();
  await expect(page.getByTestId("add-by-qr-url")).not.toHaveValue(oldUrl, { timeout: 10_000 });

  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(new URL(oldUrl).pathname);
  await expect(visitor.getByTestId("join-coach-invalid")).toBeVisible({ timeout: 10_000 });
  await context.close();
});
