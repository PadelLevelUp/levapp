import { test, expect } from "@playwright/test";
import { API_AUTH } from "../helpers/api";

/**
 * auth.parental-consent (PAD-198) under auth.register rule 18 (PAD-445): no minor can sign up
 * any more, so the guardian's consent page is reached only by accounts created before. Portugal
 * is the default country.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";
const minorBirth = () => `${new Date().getFullYear() - 10}-01-01`;

test("US-445: a minor cannot sign up, on the form or through the API", async ({ page }) => {
  // auth.register rule 18: adults only. The guardian journey (US-198) can no
  // longer be started from sign-up; the accounts it created are covered by the backend's
  // test_parental_consent.py (guardian flow kept, owner decision pending).
  const username = `e2e-minor-${stamp()}`;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
  await page.locator("#signup-name").fill(`E2E Minor ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill(minorBirth());
  // No guardian field any more, and the form refuses on the birth-date field without a request.
  await expect(page.getByTestId("signup-guardian")).toHaveCount(0);
  let registerCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/auth/register")) registerCalls += 1;
  });
  await page.getByTestId("signup-submit").click();
  await expect(page.getByTestId("signup-birthDate-error")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  expect(registerCalls).toBe(0);

  // The server is the authority: the same person straight to the API is refused and not created.
  const res = await page.request.post(`${API_AUTH}/register`, {
    data: {
      role: "student", name: `E2E Minor ${username}`, username, email: `${username}@example.com`,
      password: PASSWORD, birthDate: minorBirth(), country: "PT", guardianEmail: `g-${username}@example.com`,
    },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.code).toBe("UNDERAGE");
  expect(body.field).toBe("birthDate");
  const login = await page.request.post(`${API_AUTH}/login`, { data: { username, password: PASSWORD } });
  expect(login.status()).toBe(401);
});

test("US-198: an unknown consent link says it is no longer valid", async ({ page }) => {
  await page.goto("/guardian-consent/not-a-real-token-at-all-0000000000");
  await expect(page.getByTestId("consent-expired")).toBeVisible({ timeout: 10_000 });
});
