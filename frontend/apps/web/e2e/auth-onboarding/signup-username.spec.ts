import { test, expect } from "@playwright/test";

/**
 * auth.register rule 21 (PAD-651, B-528): a student typed his email into the username field and
 * read the generic characters message as "my gmail was rejected". The username is now pre-filled
 * from the name, an "@" in it gets its own message, and a double click sends one sign-up.
 */
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const PASSWORD = "Segura1234";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/signup");
  await page.getByTestId("signup-role-student").click();
});

test("PAD-651: the name pre-fills the username, and an email typed there is named", async ({ page }) => {
  await page.locator("#signup-name").fill("Jorge Torres");
  await expect(page.locator("#signup-username")).toHaveValue("jorge.torres");

  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/auth/register")) posts.push(r.url());
  });
  await page.locator("#signup-username").fill("jorge.torres@gmail.com");
  await page.locator("#signup-email").fill("jorge.torres@gmail.com");
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-terms").click();
  await page.getByTestId("signup-submit").click();

  await expect(page.getByTestId("signup-username-error")).toContainText(/não é o teu email|is not your email/i);
  expect(posts).toHaveLength(0);
});

test("PAD-651: a double click on Create account sends one sign-up", async ({ page }) => {
  const username = `e2e-pad651-${stamp()}`;
  await page.locator("#signup-name").fill(`E2E ${username}`);
  await page.locator("#signup-username").fill(username);
  await page.locator("#signup-email").fill(`${username}@example.com`);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-repeatPassword").fill(PASSWORD);
  await page.locator("#signup-birthDate").fill("2000-01-01");
  await page.getByTestId("signup-terms").click();

  // Hold the 201 so the second click lands while the first request is in flight.
  let posts = 0;
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  await page.route("**/api/auth/register", async (route) => {
    posts += 1;
    const response = await route.fetch();
    await released;
    await route.fulfill({ response });
  });

  await page.getByTestId("signup-submit").dblclick();
  await page.getByTestId("signup-submit").click({ force: true });
  release();

  await expect(page).not.toHaveURL(/\/signup$/, { timeout: 15_000 });
  expect(posts).toBe(1);
});
