/**
 * PAD-392 (B-155): a late load never undoes an edit.
 *
 * Settings sections loaded their data in an effect that listed `t` in its deps. `t`
 * gets a new identity when the account's language settles after a page load (i18n
 * starts at "pt", then AuthContext switches to the account's language), so the effect
 * ran a SECOND time — and when that second load resolved it replaced the section's
 * local state, silently undoing whatever the coach had changed in the meantime. On a
 * fast backend the second load lands before anyone can click, which is how three green
 * runs of coach-working-hours.spec.ts hid it; under load it lands after the click.
 *
 * So this spec does not rely on timing. It lets the FIRST load of the section's GET
 * through and HOLDS every later one, and it HOLDS the account's second `/auth/me` (the
 * one that settles the language) until the edit has been made: the trigger fires after
 * the click because the test says so, not because a timer happened to be longer than the
 * browser was slow. It then releases the account, waits for the response that causes it
 * (never a fixed sleep), releases whatever second load was made, and asserts the edit is
 * still there. It is deterministic in both directions: red on the old component every
 * time, green on the fixed one whether or not a second load is ever made. Test ids only,
 * never copy.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

/** How long to wait, after the account has settled, for a second load to be issued (it follows within a render or two). */
const SETTLE_MS = 3000;

/** A promise the test opens by hand: what is held on it stays held until `open()`. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

/** Let the first GET matching `path` through; hold every later one until `release()`. Returns a counter. */
async function holdLaterLoads(page: Page, path: RegExp) {
  const held = gate();
  const seen = { gets: 0, held: 0, delivered: 0, release: held.open };
  await page.route(path, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    seen.gets += 1;
    if (seen.gets === 1) return route.continue();
    seen.held += 1;
    await held.opened;
    await route.fulfill({ response: await route.fetch() });
    seen.delivered += 1;
  });
  return seen;
}

/**
 * Force the vulnerable ORDER. The race needs the first load to have RESOLVED (so the
 * rows are on screen and clickable) before the language settles and the effect re-runs;
 * if the language settles first, the first load is cancelled and nothing can be undone.
 * The language settles from the SECOND `/auth/me` of the page: the first is AuthContext's
 * session restore, the second is SettingsPage's own `getMe` (SettingsPage.tsx, mount
 * effect), which calls `i18n.changeLanguage` unconditionally. That second one is HELD until
 * `settle()` is called, which the test does only after the click. `/app/coach` is still
 * delayed (not gated), so the section's first load is home before the re-run.
 */
async function settleTheAccountLate(page: Page, ms = 800) {
  const held = gate();
  let me = 0;
  const seen = { meHeld: 0, settle: held.open };
  await page.route(/\/api\/auth\/me$/, async (route) => {
    me += 1;
    if (me > 1) {
      seen.meHeld += 1;
      await held.opened;
    }
    await route.continue();
  });
  await page.route(/\/api\/app\/coach$/, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
  return seen;
}

async function clearWorkingHours(request: APIRequestContext) {
  const login = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const json = await login.json();
  const res = await request.put(`${API_ROOT}/app/coach/working-hours`, {
    headers: { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` },
    data: { workingHours: null },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

test("[SETTINGS-COACH-WORKING-HOURS-4] PAD-392: working hours — a day switched off stays off when a second load arrives late", async ({ page, request }) => {
  test.setTimeout(120_000);
  await clearWorkingHours(request);
  try {
    await loginAsCoach(page);
    const seen = await holdLaterLoads(page, /\/api\/app\/coach\/working-hours$/);
    const account = await settleTheAccountLate(page);
    await page.goto("/settings?tab=calendar");
    const card = page.getByTestId("working-hours");
    const sunday = card.getByTestId("working-hours-day-sun");
    await expect(sunday).toHaveAttribute("data-state", "working", { timeout: 15_000 });

    await card.getByTestId("working-hours-works-sun").click();
    await expect(sunday).toHaveAttribute("data-state", "off");

    // The TRIGGER, on purpose and after the click: let the account settle, and wait for the
    // `/auth/me` response that does it. If none comes the spec proves nothing, and says so —
    // today that second /auth/me is SettingsPage's own getMe, whose changeLanguage is
    // unconditional; if a cleanup ever removes it, this goes red and says why, instead of the
    // spec passing on any code.
    expect(account.meHeld, "SettingsPage never asked for a second /auth/me — the language cannot settle late, nothing was tested").toBeGreaterThan(0);
    const settled = page.waitForResponse((res) => /\/api\/auth\/me$/.test(res.url()) && res.request().method() === "GET", { timeout: 15_000 });
    account.settle();
    await settled;

    // The second load, if this component makes one, follows within a render or two. Wait for it
    // (bounded: the fixed component makes none), then let it land and let React apply it.
    await expect.poll(() => seen.gets, { timeout: SETTLE_MS }).toBeGreaterThan(1).catch(() => undefined);
    seen.release();
    await expect.poll(() => seen.delivered, { message: "a held working-hours load never came back" }).toBe(seen.held);
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

    // For the old/new comparison: on the old component held >= 1 (a second load was made and
    // held); on the fixed one GETs=1. Printed, not asserted — the behaviour is the contract.
    console.log(`PAD-392 working-hours loads: GETs=${seen.gets} held=${seen.held} meHeld=${account.meHeld}`);

    // Whatever was loaded late, the edit must still be there.
    await expect(sunday).toHaveAttribute("data-state", "off");
  } finally {
    await clearWorkingHours(request);
  }
});
