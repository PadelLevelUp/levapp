import { test, expect } from "@playwright/test";
import { API_AUTH } from "../helpers/api";

/**
 * auth.register rule 18 (PAD-445): no minor can sign up. The guardian/parental-consent flow
 * itself was removed in PAD-457 (owner decision: LevApp accepts adults only, no minors exist).
 * Portugal is the default country.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";
const minorBirth = () => `${new Date().getFullYear() - 10}-01-01`;

test("US-445: a minor cannot sign up, on the form or through the API", async ({ page }) => {
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
