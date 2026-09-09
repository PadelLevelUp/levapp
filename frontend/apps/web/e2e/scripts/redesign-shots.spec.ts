import { test, expect } from "@playwright/test";

/**
 * Not a test — a screenshot harness for reviewing the redesign. The Chrome
 * extension used for manual walkthroughs is failing, so this drives the same
 * real browser and writes images we can actually look at.
 *
 * It is a tool, not a test, so it SKIPS unless REDESIGN_SHOTS is set — no
 * screenshot side effect on a normal run, and no separate testMatch config
 * (`--testMatch` is not a CLI flag in this Playwright version).
 *
 * Run: REDESIGN_SHOTS=1 npx playwright test e2e/scripts/redesign-shots.spec.ts
 */
// Written into test-results/, which is already gitignored.
const SHOTS = "test-results/redesign-shots";

test("capture redesign screens", async ({ page }) => {
  test.skip(!process.env.REDESIGN_SHOTS, "screenshot harness — set REDESIGN_SHOTS=1");

  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/auth");
  await page.locator("#username").fill("e2e-coach");
  await page.locator("#password").fill("E2eCoach123!");
  await page.screenshot({ path: `${SHOTS}/01-auth.png` });
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await expect(page.getByTestId("dashboard-kpi-players")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

  await page.goto("/calendar");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/03-calendar.png` });

  await page.goto("/players");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/04-players.png` });

  // Dark mode: next-themes persists to localStorage and toggles `.dark`.
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await page.goto("/dashboard");
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/05-dashboard-dark.png`, fullPage: true });

  await page.goto("/calendar");
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/06-calendar-dark.png` });

  // ── Phone. The layout swaps to the phone calendar below the md breakpoint,
  //    which is a different component tree, not just a narrower grid.
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/calendar");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/07-calendar-mobile.png` });

  // Pick a day that actually has classes, so the day-list row variant is
  // visible and not just the empty state.
  const dayWithClasses = page.locator('[data-testid="day-fill-dot"]').first();
  if (await dayWithClasses.count()) {
    await dayWithClasses.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/07b-calendar-mobile-day.png` });
  }

  await page.goto("/dashboard");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/08-dashboard-mobile.png`, fullPage: true });

  await page.goto("/settings");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/09-settings-mobile-list.png`, fullPage: true });
  await page.getByTestId("settings-mobile-nav-notifications").click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/09b-settings-mobile-section.png` });

  await page.goto("/messages");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/10-messages-mobile.png` });

  // Back to desktop for the toolbar legend and the dashboard bar spacing.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/calendar");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/11-calendar-desktop.png` });

  await page.goto("/messages");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/12-messages-desktop.png` });
});
