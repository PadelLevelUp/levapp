/**
 * PAD-287 (settings.role-scope rule 2): "My connections" gathers the
 * connection actions that used to sit under Account — the student's
 * "Connect with a coach", the coach's invite-by-link/QR entry, and Blocked
 * users for both — and Account keeps only deletion and legal.
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";

test("PAD-287: a student reaches My connections from the avatar menu and finds the coach link and blocked users", async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/");
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("user-menu-connections").click();
  await expect(page).toHaveURL(/\/settings\?tab=connections/);
  await expect(page.getByTestId("settings-connect-coach")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("blocked-users")).toBeVisible();
  // Account keeps deletion and legal only.
  await page.getByTestId("settings-nav-account").first().click();
  await expect(page.getByTestId("blocked-users")).toHaveCount(0);
  await expect(page.getByTestId("settings-connect-coach")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /delete account|eliminar conta/i })).toBeVisible();
});

test("PAD-287: a coach's My connections offers invite by link or QR and blocked users", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto("/settings?tab=connections");
  await expect(page.getByTestId("blocked-users")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("settings-connect-coach")).toHaveCount(0);
  await page.getByTestId("settings-add-by-qr").click();
  await expect(page).toHaveURL(/\/players\?addByQr=1/);
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
});
