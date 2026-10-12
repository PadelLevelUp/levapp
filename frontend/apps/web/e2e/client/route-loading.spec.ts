/**
 * client.route-loading (PAD-585): "Navigation still works everywhere". Every page is a lazy chunk,
 * so each route is opened twice: through the menu (a client-side route change into a chunk the
 * idle prefetch may or may not have fetched yet) and by URL (a cold load of that chunk). A route
 * passes when its page replaces the Suspense fallback and nothing throws.
 *
 * Spec: `.specflow/specs/client/route-loading.spec.md`. The menu links are reached by their test
 * id (`nav-link-<route>`), because the Presences and Messages links carry a badge in their name.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";

test.use({ viewport: { width: 1280, height: 800 } });

const COACH_MENU = ["dashboard", "calendar", "players", "training", "presences", "class-requests", "messages", "settings"];
const STUDENT_MENU = ["dashboard", "calendar", "availability", "messages", "settings"];
const COACH_ONLY_URLS = ["/training/exercises", "/training/groups"];
const STUDENT_ONLY_URLS = ["/attendance", "/absences", "/evaluations"];
const PUBLIC_URLS = ["/", "/auth", "/signup", "/forgot-password", "/privacy", "/terms", "/support", "/no-such-page"];

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The page's chunk arrived: the fallback is gone and the route rendered something. */
async function expectPageRendered(page: Page, path: string) {
  await expect(page.getByTestId("route-fallback"), `fallback still up on ${path}`).toHaveCount(0, { timeout: 20_000 });
  // The first child of #root is next-themes' inline script, never visible: look for any visible node.
  await expect(page.locator("#root *").locator("visible=true").first(), `nothing rendered on ${path}`).toBeVisible();
}

async function walkMenu(page: Page, routes: string[]) {
  for (const route of routes) {
    const link = page.getByTestId(`nav-link-${route}`).first();
    await expect(link, `menu link ${route}`).toBeVisible({ timeout: 15_000 });
    await link.click();
    await page.waitForURL(`**/${route}`);
    await expectPageRendered(page, `/${route}`);
  }
}

async function openEachByUrl(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path);
    await expectPageRendered(page, path);
  }
}

test("a coach reaches every menu page through the menu and by URL", async ({ page }) => {
  const errors = collectPageErrors(page);
  await loginAsCoach(page);
  await walkMenu(page, COACH_MENU);
  await openEachByUrl(page, [...COACH_MENU.map((r) => `/${r}`), ...COACH_ONLY_URLS]);
  expect(errors).toEqual([]);
});

test("a student reaches every menu page through the menu and by URL", async ({ page }) => {
  const errors = collectPageErrors(page);
  await loginAsStudent(page);
  await walkMenu(page, STUDENT_MENU);
  await openEachByUrl(page, [...STUDENT_MENU.map((r) => `/${r}`), ...STUDENT_ONLY_URLS]);
  expect(errors).toEqual([]);
});

test("every public page loads its chunk without a session", async ({ page }) => {
  const errors = collectPageErrors(page);
  await openEachByUrl(page, PUBLIC_URLS);
  expect(errors).toEqual([]);
});

test("a signed-in screen prefetches the other menu pages while idle", async ({ page }) => {
  const pageModules = new Set<string>();
  page.on("request", (request) => {
    const match = /\/src\/pages\/(\w+)\.tsx/.exec(new URL(request.url()).pathname);
    if (match) pageModules.add(match[1]);
  });
  await loginAsCoach(page);
  await expectPageRendered(page, "/dashboard");
  // Nothing has been clicked: the calendar and messages pages arrive through the idle prefetch.
  await expect.poll(() => pageModules.has("CalendarPage") && pageModules.has("MessagesPage"), { timeout: 15_000 }).toBe(true);
});
