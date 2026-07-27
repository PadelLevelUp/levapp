import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-89: `upsert_seasons` deleted every persisted season absent from the
 * incoming payload, and the DB-aware `validate_no_overlap` validator was never
 * wired into the write path.
 *
 * Contract after the fix — "explicit deletes only":
 *   - `POST /app/add_seasons` is a pure upsert. A season the client omits is
 *     PRESERVED, never deleted.
 *   - An omitted-but-persisted season is VALIDATED AGAINST: a payload entry
 *     overlapping it is rejected with 400 "Overlapping seasons are not allowed".
 *   - Removal happens only through `POST /app/delete/season`.
 *   - The web client sends `id` for already-persisted rows so they are updated
 *     in place rather than deleted and re-created with a fresh id.
 *
 * These tests use far-future 2027 dates so they cannot collide with the seasons
 * other specs create (season-recurrence.spec.ts uses today .. today+3 months),
 * and they clean up after themselves because the E2E DB is shared across specs.
 */

const SEASON_A = { name: "PAD-89 Alpha", start: "2027-01-04", end: "2027-03-31" };
const SEASON_B = { name: "PAD-89 Bravo", start: "2027-06-01", end: "2027-08-31" };

async function openCalendarSettings(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page.getByRole("button", { name: /^calendar$/i }).first().click();
  await expect(page.getByRole("heading", { name: /^seasons$/i })).toBeVisible({
    timeout: 5000,
  });
}

function nameInputs(page: Page) {
  return page.getByPlaceholder(/season name/i);
}

async function seasonNames(page: Page): Promise<string[]> {
  const inputs = nameInputs(page);
  const count = await inputs.count();
  const values: string[] = [];
  for (let i = 0; i < count; i++) values.push(await inputs.nth(i).inputValue());
  return values;
}

async function addSeason(
  page: Page,
  season: { name: string; start: string; end: string }
) {
  await page.getByRole("button", { name: /add season/i }).click();
  await nameInputs(page).last().fill(season.name);
  await page.getByLabel(/^season start$/i).last().fill(season.start);
  await page.getByLabel(/^season end$/i).last().fill(season.end);
}

async function saveSeasons(page: Page) {
  await page.getByRole("button", { name: /save seasons/i }).click();
}

/** Delete every PAD-89 season so the shared E2E DB is left as we found it. */
async function cleanUp(page: Page) {
  await page.reload();
  await openCalendarSettings(page);
  for (;;) {
    const names = await seasonNames(page);
    const index = names.findIndex((n) => n.startsWith("PAD-89"));
    if (index === -1) break;
    await nameInputs(page)
      .nth(index)
      .locator("xpath=ancestor::div[1]")
      .getByRole("button")
      .click();
    await expect(nameInputs(page)).toHaveCount(names.length - 1, {
      timeout: 5000,
    });
  }
}

test.describe("PAD-89: season upsert never destroys omitted seasons", () => {
  test.afterEach(async ({ page }) => {
    await cleanUp(page).catch(() => {
      /* best-effort cleanup */
    });
  });

  test("PAD-89: saving persisted seasons sends their id so rows are updated, not re-created", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openCalendarSettings(page);

    await addSeason(page, SEASON_A);
    await saveSeasons(page);
    await expect(page.getByText(/seasons saved/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Re-open from the server so every rendered row is a persisted one.
    await page.reload();
    await openCalendarSettings(page);
    expect(await seasonNames(page)).toContain(SEASON_A.name);

    // Capture the next save payload.
    const request = page.waitForRequest(
      (req) =>
        req.url().includes("/app/add_seasons") && req.method() === "POST"
    );
    await saveSeasons(page);
    const payload = JSON.parse((await request).postData() ?? "[]");

    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(0);
    for (const entry of payload) {
      expect(
        entry.id,
        `persisted season "${entry.name}" was posted without an id, so the ` +
          `backend cannot address it and would delete-and-recreate it`
      ).toBeTruthy();
    }
  });

  test("PAD-89: a partial payload does not destroy the seasons it omits", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openCalendarSettings(page);

    await addSeason(page, SEASON_A);
    await addSeason(page, SEASON_B);
    await saveSeasons(page);
    await page.reload();
    await openCalendarSettings(page);

    const before = await seasonNames(page);
    expect(before).toContain(SEASON_A.name);
    expect(before).toContain(SEASON_B.name);

    // Simulate a client that posts only part of the set (a partial save, a
    // stale tab, a future mobile client). Alpha is omitted entirely.
    await page.route("**/app/add_seasons", async (route) => {
      const original = JSON.parse(route.request().postData() ?? "[]");
      const partial = original.filter((s: { name: string }) =>
        s.name?.startsWith(SEASON_B.name)
      );
      await route.continue({ postData: JSON.stringify(partial) });
    });

    await saveSeasons(page);
    await page.waitForTimeout(1000);
    await page.unroute("**/app/add_seasons");

    await page.reload();
    await openCalendarSettings(page);
    const after = await seasonNames(page);

    expect(
      after,
      "a season omitted from the payload was silently deleted (PAD-89 data loss)"
    ).toContain(SEASON_A.name);
    expect(after).toContain(SEASON_B.name);
  });

  test("PAD-89: a new season overlapping an omitted persisted season is rejected", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openCalendarSettings(page);

    await addSeason(page, SEASON_A);
    await saveSeasons(page);
    await page.reload();
    await openCalendarSettings(page);
    expect(await seasonNames(page)).toContain(SEASON_A.name);

    // Post ONLY a new season that overlaps the persisted (and omitted) Alpha.
    await page.route("**/app/add_seasons", async (route) => {
      await route.continue({
        postData: JSON.stringify([
          {
            name: "PAD-89 Overlapper",
            startDate: "2027-03-01",
            endDate: "2027-05-31",
          },
        ]),
      });
    });

    const response = page.waitForResponse(
      (res) => res.url().includes("/app/add_seasons") && res.request().method() === "POST"
    );
    await saveSeasons(page);
    const res = await response;
    await page.unroute("**/app/add_seasons");

    expect(
      res.status(),
      "the overlap should be rejected rather than resolved by deleting the persisted season"
    ).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/overlapping seasons/i);

    await page.reload();
    await openCalendarSettings(page);
    const after = await seasonNames(page);
    expect(after).toContain(SEASON_A.name);
    expect(after).not.toContain("PAD-89 Overlapper");
  });
});
