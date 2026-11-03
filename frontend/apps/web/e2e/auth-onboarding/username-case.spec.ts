import { test, expect } from "@playwright/test";

/**
 * auth.register rule 2a / auth.login rule 1a (PAD-799, B-724): a username is chosen lowercase as it
 * is typed, and signs in in any case. "Bernardo" and "bernardo" are one username.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

test("PAD-799: a username typed with capitals is chosen lowercase and signs in with capitals", async ({ page, browser }) => {
  const id = stamp();
  const typed = `E2E-Pad799-${id}`;
  const chosen = typed.toLowerCase();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(`E2E Pad799 ${id}`);
  await page.locator("#signup-username").fill(typed);
  await expect(page.locator("#signup-username")).toHaveValue(chosen);
  await expect(page.locator("#signup-username")).toHaveAttribute("autocapitalize", "none");
  await page.locator("#signup-email").fill(`${chosen}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-terms").click();
  const created = page.waitForResponse((r) => r.url().includes("/api/auth/register") && r.request().method() === "POST");
  await page.getByTestId("signup-submit").click();
  expect((await created).status()).toBe(201);
  await expect(page).not.toHaveURL(/\/signup$/, { timeout: 15_000 });

  // A fresh browser signs in with the capitals typed the first time (rule 1a: sent as typed).
  const other = await browser.newContext();
  const signIn = await other.newPage();
  await signIn.emulateMedia({ reducedMotion: "reduce" });
  await signIn.goto("/auth");
  await signIn.locator("#username").fill(typed);
  await expect(signIn.locator("#username")).toHaveValue(typed);
  await signIn.locator("#password").fill(PASSWORD);
  const login = signIn.waitForResponse((r) => r.url().includes("/api/auth/login"));
  await signIn.locator('button[type="submit"]').click();
  expect((await login).status()).toBe(200);
  await signIn.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 10_000 });
  await other.close();
});
