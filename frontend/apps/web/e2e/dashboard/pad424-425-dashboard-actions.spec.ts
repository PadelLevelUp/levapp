import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-424 / PAD-425: the coach dashboard's invite actions.
 * By test id only; the sidebar is open by default on desktop (ui/sidebar defaultOpen).
 */

test("PAD-424: 'Mais tarde' stays inside its empty-seats card at every desktop width, sidebar open", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);
  const card = page.locator('[data-testid^="needs-you-empty-seats-"]').first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  const overflows: string[] = [];
  for (const width of [1024, 1152, 1280, 1366, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const c = (await card.boundingBox())!;
    const later = (await card.getByTestId("needs-you-later").boundingBox())!;
    if (later.x + later.width > c.x + c.width + 1 || later.y + later.height > c.y + c.height + 1) {
      overflows.push(`${width}px: button right ${Math.round(later.x + later.width)} / card right ${Math.round(c.x + c.width)}`);
    }
  }
  expect(overflows).toEqual([]);
});

test("PAD-425: 'Convidar' in Próximos 7 dias opens the class's invite flow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsCoach(page);
  await openDashboard(page);
  const invite = page.getByTestId("dashboard-schedule-invite").first();
  await expect(invite).toBeVisible({ timeout: 15_000 });
  // The same link as "Convidar x jogadores" in Precisa de ti (needs-you-deep-links.spec.ts): the
  // calendar consumes notify=1 on arrival, so wait for the URL from before the click, then for the
  // invite dialog it opens.
  const deepLink = page.waitForURL(/\/calendar\?.*notify=1/, { timeout: 15_000 });
  await invite.click();
  await deepLink;
  await expect(page.getByTestId("notify-students-dialog")).toBeVisible({ timeout: 15_000 });
});
