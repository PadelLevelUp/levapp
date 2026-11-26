/**
 * classes.class-requests rule 21 (criterion 60): the private class's three steps in a real browser. At every step the one
 * main button is in view, full width and at least 44px high, `wizard-back` is in view and 44px by 44px, the controls
 * the rule lists are at least 44px high at 320px wide, each step opens at its top, and the request is sent.
 * Test ids and boxes only, never copy. The request is withdrawn and deleted in `finally`.
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { deleteClassRequests, withdrawClassRequests } from "../helpers/cleanup";
import { continueTo } from "../helpers/class-request-steps";

async function bearer(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openPrivate(page: Page) {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.getByTestId("class-request-book").click();
  const wizard = page.getByTestId("class-request-wizard");
  await expect(wizard).toBeVisible();
  await expect(wizard).not.toHaveAttribute("data-step", "loading", { timeout: 10_000 });
  if ((await wizard.getAttribute("data-step")) === "coach") await wizard.locator('[data-testid^="wizard-coach-"]').first().click();
  await expect(wizard).toHaveAttribute("data-step", "kind", { timeout: 10_000 });
  await wizard.getByTestId("wizard-kind-private").click();
  await expect(wizard.locator('[data-private-step="people"]')).toBeVisible();
  return wizard;
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "the control has a box").not.toBeNull();
  return b!;
}

/** The main button and the back control are in view and big enough; the body is scrolled to its top. */
async function checkStep(page: Page, wizard: Locator, button: string, withBack: boolean) {
  const vp = page.viewportSize()!;
  const main = await box(wizard.getByTestId(button));
  expect(main.height).toBeGreaterThanOrEqual(44);
  expect(main.y).toBeGreaterThanOrEqual(0);
  expect(main.y + main.height).toBeLessThanOrEqual(vp.height);
  const foot = await box(wizard.getByTestId("wizard-foot"));
  expect(main.width).toBeGreaterThanOrEqual(foot.width * 0.8);
  if (withBack) {
    const back = await box(wizard.getByTestId("wizard-back"));
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
    expect(back.y).toBeGreaterThanOrEqual(0);
    expect(back.y + back.height).toBeLessThanOrEqual(vp.height);
  }
  expect(await wizard.getByTestId("wizard-body").evaluate((el) => el.scrollTop)).toBe(0);
}

async function atLeast44(l: Locator) {
  for (const el of await l.all()) expect((await box(el)).height).toBeGreaterThanOrEqual(43.5);
}

for (const size of [
  { name: "320 wide", width: 320, height: 700 },
  { name: "1280 wide", width: 1280, height: 800 },
  { name: "320 wide, 420 high", width: 320, height: 420 },
]) {
  test(`CLASSES-CLASS-REQUESTS-60: one button in view at every step (${size.name})`, async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: size.width, height: size.height });
    const ids: string[] = [];
    try {
      const wizard = await openPrivate(page);
      await checkStep(page, wizard, "wizard-continue", true);
      if (size.width <= 320) await atLeast44(wizard.locator('[data-testid^="wizard-people-"]'));

      await continueTo(wizard, "when");
      await checkStep(page, wizard, "wizard-continue", true);
      await wizard.getByTestId("wizard-date").fill(isoDaysAhead(13));
      if (size.width <= 320) {
        await atLeast44(wizard.locator('[data-testid^="wizard-recurrence-"]'));
        await wizard.getByTestId("wizard-recurrence-weekly").click();
        await atLeast44(wizard.locator('[data-testid^="wizard-weekday-"]'));
        await atLeast44(wizard.locator('[data-testid^="request-end-mode-"]'));
        await wizard.getByTestId("request-end-mode-count").click();
        await atLeast44(wizard.locator('[data-testid^="request-end-count-"]:is(button)'));
        await wizard.getByTestId("wizard-recurrence-single").click();
        await wizard.getByTestId("wizard-date").fill(isoDaysAhead(13));
      }

      // The next step opens at its top even when this one was scrolled down.
      await wizard.getByTestId("wizard-body").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await continueTo(wizard, "time");
      await expect(wizard.getByTestId("wizard-slots")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
      await checkStep(page, wizard, "wizard-send", true);
      if (size.width <= 320) {
        await atLeast44(wizard.locator('[data-testid^="wizard-duration-"]'));
        await atLeast44(wizard.getByTestId("wizard-slot"));
      }
      await wizard.getByTestId("wizard-slot").first().click();
      const posted = page.waitForResponse((r) => /\/api\/app\/class-requests$/.test(r.url()) && r.request().method() === "POST");
      await wizard.getByTestId("wizard-send").click();
      const res = await posted;
      expect(res.status(), await res.text()).toBeLessThan(300);
      ids.push(String((await res.json()).id));
      await expect(wizard).toHaveCount(0);
    } finally {
      if (ids.length) {
        await withdrawClassRequests(request, await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD), ids);
        await deleteClassRequests(request, await bearer(request, COACH_USERNAME, COACH_PASSWORD), ids);
      }
    }
  });
}
