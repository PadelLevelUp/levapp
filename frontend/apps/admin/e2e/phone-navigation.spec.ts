import { expect, test } from "./fixtures";

// admin.phone-console rules 1, 2 and 6, asserted at 375 x 667.
test.use({ viewport: { width: 375, height: 667 }, locale: "en-US" });

const ROUTES = ["/", "/approvals", "/users", "/users/1", "/settings", "/roles", "/audit", "/engine-health", "/clubs", "/clubs/1", "/switches"];

test.describe("phone navigation", () => {
  test("every console page fits 375 px with a top bar and no sidebar", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth on ${route}`).toBe(375);
      await expect(page.getByTestId("admin-topbar"), route).toBeVisible();
      await expect(page.getByTestId("admin-sidebar"), route).toHaveCount(0);
    }
  });

  test("the drawer carries the session block and navigates", async ({ page, signedIn }) => {
    await page.goto("/");
    await page.getByTestId("admin-menu-button").click();
    const drawer = page.getByTestId("admin-nav-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link")).toHaveCount(9);
    await expect(drawer.getByTestId("admin-session-email")).toHaveText(signedIn.email);
    await expect(drawer.getByText("operator", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("combobox")).toBeVisible();
    await expect(drawer.getByTestId("admin-sign-out")).toBeVisible();

    await drawer.getByRole("link", { name: /Users/ }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(drawer).toBeHidden();
  });

  test("the sign-in card fits a phone", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("admin-sign-in");
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(343);

    const button = page.getByTestId("admin-google-button");
    await expect(button).toBeVisible();
    const slot = await button.boundingBox();
    expect(slot).not.toBeNull();
    expect(slot!.x).toBeGreaterThanOrEqual(0);
    expect(slot!.x + slot!.width).toBeLessThanOrEqual(375);
    expect(slot!.y + slot!.height).toBeLessThanOrEqual(667);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });
});
