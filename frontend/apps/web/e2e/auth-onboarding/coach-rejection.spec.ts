import { test, expect, type Page } from "@playwright/test";
import { COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * auth.coach-approval rules 10–13 (PAD-233): a rejected coach is signed out,
 * the login screen says why and offers "request again", which puts them back
 * in the admin's queue and lands them on the pending screen.
 *
 * The seeded `e2e-coach` is the superadmin (e2e/scripts/seed.py). The coach
 * under test is registered and email-verified through the API so the only
 * thing the browser does is the login screen.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

async function adminToken(page: Page): Promise<string> {
  const res = await page.request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

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

async function pendingCoachId(page: Page, token: string, username: string): Promise<number | undefined> {
  const res = await page.request.get(`${API_APP}/admin/coach-approvals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as { coachId: number; username: string }[];
  return rows.find((r) => r.username === username)?.coachId;
}

test("US-233: a rejected coach is told why on login and can ask again", async ({ page }) => {
  const username = `e2e-rej-${stamp()}`;
  await registerVerifiedCoach(page, username);
  const admin = await adminToken(page);
  const coachId = await pendingCoachId(page, admin, username);
  expect(coachId, "coach is pending after signup").toBeTruthy();
  const reject = await page.request.post(`${API_APP}/admin/coach-approvals/${coachId}/reject`, {
    data: { reason: "E2E: not a coach" },
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(reject.ok()).toBeTruthy();

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
  expect(await pendingCoachId(page, admin, username), "coach is pending again").toBe(coachId);
});
