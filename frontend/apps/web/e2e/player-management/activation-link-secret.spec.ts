import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * auth.activate rules 2, 4, 8 (PAD-254, B-034) — the activation link carries
 * a per-account secret. The numeric id alone opens nothing: no form, no
 * contact details, and not even a request to the lookup endpoint.
 */

const UNIQUE = Date.now();

async function createInactivePlayer(page: Page, name: string): Promise<string> {
  await openPlayers(page);
  await page.getByRole("button", { name: /add player/i }).first().click();
  await expect(page.getByText("New player")).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("e.g. John Doe").fill(name);
  await page.getByRole("button", { name: /create player/i }).click();

  await page.getByPlaceholder(/search/i).first().fill(name);
  await page.getByText(name).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 8000 });

  const link = await page.locator("input[readonly]").first().inputValue();
  expect(link).toContain("/register/");
  return link;
}

test.describe("Activation link secret (PAD-254)", () => {
  test("the coach's link carries the secret, and the bare id is not a link", async ({
    page,
    browser,
  }) => {
    await loginAsCoach(page);
    const link = await createInactivePlayer(page, `PAD254 Secret ${UNIQUE}`);

    const url = new URL(link);
    const token = url.searchParams.get("t");
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const context = await browser.newContext();
    const visitor = await context.newPage();
    const lookups: string[] = [];
    visitor.on("request", (req) => {
      if (req.url().includes("/api/app/register/user/")) lookups.push(req.url());
    });

    // Bare id: the invalid-link screen, and no lookup request at all.
    await visitor.goto(url.pathname);
    await expect(visitor.getByTestId("register-invalid")).toBeVisible();
    await expect(visitor.locator("#username")).toHaveCount(0);
    expect(lookups).toEqual([]);

    // Wrong secret: the backend 404s, same screen, no contact details.
    await visitor.goto(`${url.pathname}?t=${"0".repeat(64)}`);
    await expect(visitor.getByTestId("register-invalid")).toBeVisible();
    await expect(visitor.locator("#username")).toHaveCount(0);

    // The real link: the form, with the coach-typed name and an empty username.
    await visitor.goto(`${url.pathname}${url.search}`);
    await expect(visitor.locator("#username")).toHaveValue("");
    await expect(visitor.locator("#name")).toHaveValue(`PAD254 Secret ${UNIQUE}`);

    await context.close();
  });
});
