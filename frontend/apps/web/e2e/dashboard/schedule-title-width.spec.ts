import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

// PAD-336 / dashboard.blocks rule 3a (schedule rows follow the list's width).
// At 1280×800 the "Next 7 days" list is ~530px wide, and the desktop row's
// fixed columns left the class title 66px, so every seeded row read "E2E …".
// The seeded titles (up to "E2E Pending Confirm Class", ~193px) must fit.
test.use({ viewport: { width: 1280, height: 800 } });

test("PAD-336: next-7-days rows show the class title in full at 1280×800", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);

  const rows = page.getByTestId("dashboard-schedule-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });

  const titles = page.getByTestId("dashboard-schedule-title");
  const count = await titles.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBe(await rows.count());
  for (let i = 0; i < count; i++) {
    const { scrollWidth, clientWidth } = await titles.nth(i).evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth, `row ${i} title is clipped (${clientWidth}px shown)`).toBeLessThanOrEqual(clientWidth);
  }

  // The row keeps its action: an under-capacity row still offers Invite.
  await expect(page.getByTestId("dashboard-schedule-invite").first()).toBeVisible();
});
