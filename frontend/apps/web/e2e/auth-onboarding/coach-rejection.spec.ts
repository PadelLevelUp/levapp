import { test, expect, type Page } from "@playwright/test";
import { API_AUTH } from "../helpers/api";
import { coachApprovalStatusInDb, rejectCoachInDb } from "../helpers/coachApproval";

/**
 * auth.coach-approval rules 10–13 (PAD-233): a rejected coach is signed out,
 * the login screen says why and offers "request again", which puts them back
 * in the staff console's queue and lands them on the pending screen.
 *
 * The coach under test is registered and email-verified through the API and
 * rejected in the E2E database (the staff console owns rejection, PAD-532), so
 * the only thing the browser does is the login screen.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

async function registerVerifiedCoach(page: Page, username: string) {
  const email = `${username}@example.com`;
  const reg = await page.request.post(`${API_AUTH}/register`, {
    data: { role: "coach", name: `E2E rejected ${username}`, username, email, password: PASSWORD, birthDate: "2000-01-01", country: "PT" },
  });
  expect(reg.status(), "register").toBe(201);
  const token = ((await reg.json()) as { accessToken: string }).accessToken;
  const codeRes = await page.request.get(`${API_AUTH}/email-verification/debug/last-code?email=${encodeURIComponent(email)}`);
  expect(codeRes.ok()).toBeTruthy();
  const { code } = (await codeRes.json()) as { code: string };
  const confirm = await page.request.post(`${API_AUTH}/email-verification/confirm`, {
    data: { code },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(confirm.ok(), "verify email").toBeTruthy();
}

test("US-233: a rejected coach is told why on login and can ask again", async ({ page }) => {
  const username = `e2e-rej-${stamp()}`;
  await registerVerifiedCoach(page, username);
  rejectCoachInDb(username, "E2E: not a coach");

  // Rule 11 / 13: the login says why, with no dashboard.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/auth");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId("login-rejected")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("login-rejected-reason")).toContainText("E2E: not a coach");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByTestId("launch-loader")).toHaveCount(0);

  // Rule 12: request again → signed in, on the pending screen, back in the queue.
  await page.getByTestId("login-reapply").click();
  await expect(page).toHaveURL(/\/coach-pending$/, { timeout: 15_000 });
  await expect(page.getByTestId("coach-pending")).toBeVisible();
  expect(coachApprovalStatusInDb(username), "coach is pending again").toBe("pending");
});
