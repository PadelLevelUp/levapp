import { expect, test } from "./fixtures";
import { ui } from "./i18n";

// admin.phone-console rules 1, 2 and 6, asserted at 375 x 667.
test.use({ viewport: { width: 375, height: 667 }, locale: "en-US" });

const routes = (userId: number) => ["/", "/approvals", "/users", `/users/${userId}`, "/settings", "/roles", "/audit", "/engine-health", "/clubs", "/clubs/1", "/switches"];

test.describe("phone navigation", () => {
  test("PAD-572: every console page fits 375 px with a top bar and no sidebar", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    for (const route of routes(signedIn.userIds[0])) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth on ${route}`).toBe(375);
      await expect(page.getByTestId("admin-topbar"), route).toBeVisible();
      await expect(page.getByTestId("admin-sidebar"), route).toHaveCount(0);
    }
  });

  test("PAD-572: the drawer carries the session block and navigates", async ({ page, signedIn }) => {
    await page.goto("/");
    await page.getByTestId("admin-menu-button").click();
    const drawer = page.getByTestId("admin-nav-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link")).toHaveCount(9);
    await expect(drawer.getByTestId("admin-session-email")).toHaveText(signedIn.email);
    await expect(drawer.getByTestId("admin-session-role")).toContainText(ui("admin.shell.role.operator"));
    await expect(drawer.getByRole("combobox")).toBeVisible();
    await expect(drawer.getByTestId("admin-sign-out")).toBeVisible();

    await drawer.getByRole("link", { name: ui("admin.shell.nav.users") }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(drawer).toBeHidden();
  });

  test("PAD-572: the sign-in card fits a phone", async ({ page }) => {
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

  test("PAD-572: desktop keeps the sidebar and has no top bar", async ({ page, signedIn }) => {
    expect(signedIn.role).toBe("operator");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/users");
    await expect(page.getByTestId("admin-sidebar")).toBeVisible();
    await expect(page.getByTestId("admin-topbar")).toHaveCount(0);
    await expect(page.getByTestId("admin-menu-button")).toHaveCount(0);
  });
});
