import { expect, test } from "./fixtures";

// admin.phone-console rules 1, 3 and 4, asserted at 375 x 667.
test.use({ viewport: { width: 375, height: 667 }, locale: "en-US" });

const scrollWidth = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth);

test.describe("phone tables", () => {
  test("users results are cards with a tappable name", async ({ page, signedIn }) => {
    expect(signedIn.email).toContain("@");
    await page.goto("/users");
    // The web seed holds "E2E Student", "E2E Student Two" and "E2E Student Three".
    await page.getByTestId("admin-users-search").fill("E2E Student");
    await page.getByTestId("admin-users-submit").click();

    const rows = page.locator('[data-testid^="admin-user-row-"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    expect(await scrollWidth(page)).toBe(375);

    const link = page.locator('[data-testid^="admin-user-link-"]').first();
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const href = await link.getAttribute("href");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("the audit log scrolls inside its own container", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    await page.goto("/audit");
    const rows = page.locator('[data-testid^="admin-audit-row-"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(3);

    const scroller = page.getByTestId("admin-audit-table-scroll");
    const metrics = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    expect(await scrollWidth(page)).toBe(375);
  });

  test("approvals keep both actions reachable", async ({ page, signedIn }) => {
    const coachId = signedIn.pendingCoachIds[0];
    await page.goto("/approvals");
    const approve = page.getByTestId(`admin-approve-${coachId}`);
    const reject = page.getByTestId(`admin-reject-${coachId}`);
    await expect(approve).toBeVisible();
    await expect(reject).toBeVisible();
    for (const control of [approve, reject]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
    }
    expect(await scrollWidth(page)).toBe(375);
  });

  test("tap targets in the drawer and on the users page are 44 px tall", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    await page.goto("/users");
    await page.getByTestId("admin-users-search").fill("E2E Student");
    await page.getByTestId("admin-users-submit").click();
    await expect(page.locator('[data-testid^="admin-user-row-"]').first()).toBeVisible();

    await page.getByTestId("admin-menu-button").click();
    await expect(page.getByTestId("admin-nav-drawer")).toBeVisible();

    const heights = await page.evaluate(() => {
      const scopes = [document.querySelector('[data-testid="admin-nav-drawer"]'), document.querySelector("main")];
      const out: { what: string; height: number }[] = [];
      for (const scope of scopes) {
        scope?.querySelectorAll("button, a, select, input").forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          out.push({ what: `${el.tagName.toLowerCase()} ${el.getAttribute("data-testid") ?? el.textContent?.trim() ?? ""}`, height: r.height });
        });
      }
      return out;
    });
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h.height, h.what).toBeGreaterThanOrEqual(44);
  });
});
