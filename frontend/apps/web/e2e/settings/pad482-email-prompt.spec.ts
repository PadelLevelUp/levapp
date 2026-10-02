/**
 * PAD-482 — auth.email-verification rule 14 and B-262: a coach with no email is asked for one on the
 * coach home, adds it from Settings → Perfil, confirms the code, and is no longer asked.
 *
 * The shared seeded coach is cleared of its email through the API (B-262: that also clears its
 * verification), and the test gives the same address back through the UI. Cleanup: if the test stops
 * half-way, the address is restored through the API and its code confirmed through the debug outbox
 * (rule 11), as `profile-persistence.spec.ts` does, so the coach is never left held on the code screen.
 * Located by test id.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { API_AUTH } from "../helpers/api";
import { completeEmailVerification } from "../helpers/emailVerification";

const EMAIL = "e2e-coach@test.com";

async function auth(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("accessToken"));
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

test("PAD-482: a coach with no email is asked for one, adds it and confirms it", async ({ page }) => {
  await loginAsCoach(page);
  const headers = await auth(page);
  const cleared = await page.request.patch(`${API_AUTH}/me`, { headers, data: { email: "" } });
  expect(cleared.ok(), await cleared.text()).toBeTruthy();
  expect((await cleared.json()).emailVerification).toBe("unverified"); // B-262

  try {
    await page.goto("/dashboard");
    const banner = page.getByTestId("email-prompt");
    await expect(page.getByTestId("coach-dashboard")).toBeVisible({ timeout: 15000 });
    await expect(banner).toBeVisible();

    // "Agora não" lasts for this page session only: a reload is a new session and asks again.
    await page.getByTestId("email-prompt-dismiss").click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(banner).toBeVisible({ timeout: 15000 });

    // B-263: hold Settings' GET /auth/me until the email is typed, so the typing always lands first.
    let release!: () => void;
    const typed = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/auth/me", async (route) => {
      if (route.request().method() === "GET") await typed;
      await route.continue();
    });
    await page.getByTestId("email-prompt-add").click();
    await expect(page).toHaveURL(/\/settings\?tab=profile&focus=email/);
    const field = page.getByTestId("settings-profile-email");
    await expect(field).toBeFocused();
    await expect(page.getByTestId("settings-profile-email-needed")).toBeVisible();

    // Typed before GET /auth/me has filled the form: B-263 fills the untouched name all the same.
    await field.fill(EMAIL);
    release();
    await expect(page.locator("#profile-name")).toHaveValue("E2E Coach", { timeout: 10000 });
    await page.unroute("**/api/auth/me");
    await expect(page.getByTestId("settings-profile-email-needed")).toBeHidden();
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/auth/me") && r.request().method() === "PATCH");
    await page.getByTestId("settings-header-save").click();
    const patch = (await saved).request().postDataJSON() as Record<string, unknown>;
    expect(patch.email).toBe(EMAIL);
    expect(patch.name === undefined || patch.name === "E2E Coach", `name sent as ${JSON.stringify(patch.name)}`).toBeTruthy();
    await completeEmailVerification(page);

    const me = await (await page.request.get(`${API_AUTH}/me`, { headers })).json();
    expect([me.email, me.emailVerification]).toEqual([EMAIL, "verified"]);
    await page.goto("/dashboard");
    await expect(page.getByTestId("coach-dashboard")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("email-prompt")).toHaveCount(0);
  } finally {
    const me = await (await page.request.get(`${API_AUTH}/me`, { headers })).json().catch(() => null);
    if (me && me.email !== EMAIL) {
      await page.request.patch(`${API_AUTH}/me`, { headers, data: { email: EMAIL } }).catch(() => undefined);
    }
    if (me && me.emailVerification !== "verified") {
      const codeRes = await page.request.get(`${API_AUTH}/email-verification/debug/last-code`, { headers }).catch(() => null);
      if (codeRes?.ok()) {
        const { code } = (await codeRes.json()) as { code: string };
        await page.request.post(`${API_AUTH}/email-verification/confirm`, { headers, data: { code } }).catch(() => undefined);
      }
    }
  }
});
