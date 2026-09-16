import { test, expect, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * PAD-279 / PAD-238 — auth.coach-approval rule 9, criterion "Admin switches the
 * approval gate off and on". The seeded e2e-coach is the superadmin. The gate is
 * restored to ON at the end whatever happens: coach-rejection.spec.ts and the
 * signup specs rely on a self-registered coach starting `pending`.
 *
 * Mirrors: apps/mobile/.maestro/flows/40-admin-coach-approval-switch.yaml
 */

async function adminHeaders(page: Page) {
  const res = await page.request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const { accessToken } = await res.json();
  return { Authorization: `Bearer ${accessToken}` };
}

test("US-279: admin switches the coach approval gate off, a new coach is approved at once, then back on", async ({ page }) => {
  const headers = await adminHeaders(page);
  try {
    await loginAsCoach(page);
    await openSettings(page);
    await page.getByTestId("settings-nav-admin").first().click();

    const sw = page.getByTestId("admin-coach-approval-required-switch");
    await expect(sw).toBeVisible({ timeout: 10000 });
    await expect(sw).toHaveAttribute("aria-checked", "true");

    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    const off = await (await page.request.get(`${API_APP}/admin/settings`, { headers })).json();
    expect(off).toEqual({ coachApprovalRequired: false, source: "database" });

    // A coach who registers now is approved at once.
    const username = `e2e-gate-${Date.now()}`;
    const reg = await page.request.post(`${API_AUTH}/register`, {
      data: {
        role: "coach",
        name: "Gate Off",
        username,
        email: `${username}@example.com`,
        password: "Segura1234",
        birthDate: "2000-01-01",
        country: "PT",
      },
    });
    expect(reg.status()).toBe(201);
    const { accessToken } = await reg.json();
    const me = await (
      await page.request.get(`${API_AUTH}/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
    ).json();
    expect(me.coachApproval).toBe("approved");

    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    const on = await (await page.request.get(`${API_APP}/admin/settings`, { headers })).json();
    expect(on.coachApprovalRequired).toBe(true);
  } finally {
    await page.request.put(`${API_APP}/admin/settings`, {
      headers,
      data: { coachApprovalRequired: true },
    });
  }
});
