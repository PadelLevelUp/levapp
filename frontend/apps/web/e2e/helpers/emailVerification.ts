import { expect, type Page } from "@playwright/test";
import { API_AUTH } from "./api";

/**
 * auth.email-verification rule 11: the E2E backend runs with
 * E2E_DEBUG_ENDPOINTS on, so every mail lands in an in-process outbox and
 * this route hands back the 6-digit code from the newest one addressed to the
 * signed-in user. Nothing here exists on a deployed backend.
 */
export async function readVerificationCode(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("accessToken"));
  expect(token, "a session token is needed to read the code").toBeTruthy();
  const res = await page.request.get(`${API_AUTH}/email-verification/debug/last-code`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `debug last-code route answered ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { code: string };
  return body.code;
}

/** Type a code into the six cells (one hidden input behind them). */
export async function typeVerificationCode(page: Page, code: string) {
  const input = page.getByTestId("verify-email-code");
  await input.click();
  await input.fill(code);
}

/** From the Verify your email screen, read the real code and submit it. */
export async function completeEmailVerification(page: Page) {
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 15_000 });
  await expect(page.getByTestId("verify-email")).toBeVisible();
  const code = await readVerificationCode(page);
  await typeVerificationCode(page, code);
  await expect(page).not.toHaveURL(/\/verify-email/, { timeout: 15_000 });
}
