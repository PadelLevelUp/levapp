/**
 * settings.unsaved-edits (PAD-394, ledger B-157) — web acceptance criterion
 * "Switching tab with an unsaved edit asks first": a coach on Settings › Calendar
 * who switches Sunday off and has not saved, then chooses the Preferences tab,
 * is asked "Descartar alterações?" / "Discard changes?" before the tab changes.
 * Keep editing stays on Calendar with the edit intact; Discard shows Preferences
 * and drops it — a later return to Calendar shows Sunday as the server has it
 * (the section unmounted and reloaded fresh, not held in memory — B-157's
 * "warn, not hold" decision).
 *
 * Test ids only, never rendered copy (e2e-web-renders-portuguese): the seeded
 * e2e-coach account renders English, the app's fallback is pt.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

/** Same reset as settings-load-does-not-undo-edits.spec.ts: a known seeded
 * state (no override) reads as every day "working", so "Sunday as seeded"
 * after a discard is a real assertion, not an accident of leftover state. */
async function clearWorkingHours(request: APIRequestContext) {
  const login = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const json = await login.json();
  const res = await request.put(`${API_ROOT}/app/coach/working-hours`, {
    headers: { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` },
    data: { workingHours: null },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

test.describe("PAD-394: Settings — switching tab with an unsaved edit asks first (web)", () => {
  test.beforeEach(async ({ request }) => {
    await clearWorkingHours(request);
  });
  test.afterEach(async ({ request }) => {
    await clearWorkingHours(request);
  });

  test("Calendar → Sunday off → Preferences asks; Keep stays; Discard leaves and a later return reloads fresh", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await page.goto("/settings?tab=calendar");

    const sunday = page.getByTestId("working-hours-day-sun");
    await expect(sunday).toHaveAttribute("data-state", "working", { timeout: 15_000 });
    await page.getByTestId("working-hours-works-sun").click();
    await expect(sunday).toHaveAttribute("data-state", "off");

    // Choosing another tab with the edit unsaved asks first.
    await page.getByTestId("settings-nav-preferences").click();
    const dialogEl = page.getByTestId("settings-unsaved-dialog");
    await expect(dialogEl).toBeVisible();

    // Keep editing: closes, Calendar still shown, the edit is untouched.
    await page.getByTestId("settings-unsaved-keep").click();
    await expect(dialogEl).not.toBeVisible();
    await expect(page.getByTestId("working-hours")).toBeVisible();
    await expect(sunday).toHaveAttribute("data-state", "off");

    // Preferences again, this time Discard.
    await page.getByTestId("settings-nav-preferences").click();
    await expect(dialogEl).toBeVisible();
    await page.getByTestId("settings-unsaved-discard").click();
    await expect(dialogEl).not.toBeVisible();
    await expect(page.getByTestId("settings-request-alerts")).toBeVisible();
    await expect(page.getByTestId("working-hours")).not.toBeVisible();

    // Back to Calendar: nothing unsaved any more, so this switch is immediate,
    // and the section — having unmounted on discard — loads fresh from the
    // server rather than from the dropped local edit.
    await page.getByTestId("settings-nav-calendar").click();
    await expect(dialogEl).not.toBeVisible();
    await expect(sunday).toHaveAttribute("data-state", "working", { timeout: 15_000 });
  });

  test("PAD-447: the avatar menu's My connections, with an unsaved edit, asks first too", async ({ page }) => {
    await loginAsCoach(page);
    await page.goto("/settings?tab=calendar");
    const sunday = page.getByTestId("working-hours-day-sun");
    await expect(sunday).toHaveAttribute("data-state", "working", { timeout: 15_000 });
    await page.getByTestId("working-hours-works-sun").click();
    await expect(sunday).toHaveAttribute("data-state", "off");

    // The menu navigates to /settings?tab=connections while Settings is mounted (B-199): the same
    // rule-3 question, and keeping the edit keeps Calendar on screen.
    await page.getByTestId("user-menu-trigger").click();
    await page.getByTestId("user-menu-connections").click();
    const dialogEl = page.getByTestId("settings-unsaved-dialog");
    await expect(dialogEl).toBeVisible();
    await page.getByTestId("settings-unsaved-keep").click();
    await expect(dialogEl).not.toBeVisible();
    await expect(sunday).toHaveAttribute("data-state", "off");
    await expect(page.getByTestId("blocked-users")).toHaveCount(0);
    // PAD-459: the URL follows the section still shown, not the one the menu asked for.
    await expect(page).toHaveURL(/\/settings\?tab=calendar$/);
  });
});

