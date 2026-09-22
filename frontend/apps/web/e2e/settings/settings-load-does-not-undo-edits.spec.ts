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
 * through and HOLDS every later one for HOLD_MS, makes an edit during the hold, waits
 * the hold out, and asserts the edit is still there. It is deterministic in both
 * directions: red on the old component every time, green on the fixed one whether or
 * not a second load is ever made. Test ids only, never copy.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";

const HOLD_MS = 2500;

/** Let the first GET matching `path` through; hold every later one for HOLD_MS. Returns a counter. */
async function holdLaterLoads(page: Page, path: RegExp): Promise<{ gets: number; held: number }> {
  const seen = { gets: 0, held: 0 };
  await page.route(path, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    seen.gets += 1;
    if (seen.gets > 1) {
      seen.held += 1;
      await new Promise((r) => setTimeout(r, HOLD_MS));
    }
    await route.continue();
  });
  return seen;
}

/**
 * Force the vulnerable ORDER. The race needs the first load to have RESOLVED (so the
 * rows are on screen and clickable) before the language settles and the effect re-runs;
 * if the language settles first, the first load is cancelled and nothing can be undone.
 * In the integrator's traces the re-run follows the second `/auth/me` and `/app/coach`
 * resolving, so every `/auth/me` after the first, and `/app/coach`, are delayed: the
 * section's first load (not delayed) is then always home before the re-run.
 */
async function settleTheAccountLate(page: Page, ms = 800): Promise<{ meResolvedAt: number[] }> {
  let me = 0;
  const seen = { meResolvedAt: [] as number[] };
  await page.route(/\/api\/auth\/me$/, async (route) => {
    me += 1;
    if (me > 1) await new Promise((r) => setTimeout(r, ms));
    await route.continue();
    seen.meResolvedAt.push(Date.now());
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

test("PAD-392: working hours — a day switched off stays off when a second load arrives late", async ({ page, request }) => {
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
    const clickedAt = Date.now();
    await expect(sunday).toHaveAttribute("data-state", "off");

    // Outlast any held load, then look again: the edit must still be there.
    await page.waitForTimeout(HOLD_MS + 1500);
    await expect(sunday).toHaveAttribute("data-state", "off");
    // The TRIGGER must have fired, or this spec proves nothing: the account (and with it the
    // language, and `t`) must have settled AFTER the click. Today that second /auth/me comes
    // from SettingsPage's own getMe, whose changeLanguage is unconditional; if a cleanup ever
    // removes it, this assertion goes red and says why, instead of the spec passing on any code.
    expect(
      account.meResolvedAt.filter((at) => at > clickedAt).length,
      "no /auth/me resolved after the click — the language never settled late, nothing was tested",
    ).toBeGreaterThan(0);
    // For the old/new comparison: on the old component held >= 1 (a second load was made and
    // held); on the fixed one GETs=1. Printed, not asserted — the behaviour is the contract.
    console.log(`PAD-392 working-hours loads: GETs=${seen.gets} held=${seen.held} meAfterClick=${account.meResolvedAt.filter((at) => at > clickedAt).length}`);
  } finally {
    await clearWorkingHours(request);
  }
});
