import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar, openSettings } from "../helpers/navigation";
import { API_APP } from "../helpers/api";

/**
 * PAD-82 — `calendar.seasons`: the coach's ONE recurring day/month season.
 *
 * Settings → Calendar holds a single card (label, start day/month, end
 * day/month, a preview of the current-or-upcoming occurrence, Save, Remove).
 * A recurring class set to "recurs until season end" ends with the occurrence
 * its start date belongs to. The seeded coach defaults to English.
 *
 * The E2E DB is shared across specs, so every test here leaves the coach with
 * no season (the seed state) — `resetSeason` runs before and after.
 */

async function openCalendarSettings(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: /^calendar$/i }).first().click();
  await expect(page.getByRole("heading", { name: /^season$/i })).toBeVisible({ timeout: 5000 });
}

async function token(page: Page): Promise<string> {
  const value = await page.evaluate(() => localStorage.getItem("accessToken"));
  expect(value, "a session token is needed").toBeTruthy();
  return value as string;
}

async function resetSeason(page: Page) {
  const res = await page.request.delete(`${API_APP}/season`, {
    headers: { Authorization: `Bearer ${await token(page)}` },
  });
  expect([204, 200]).toContain(res.status());
}

/** Radix Select: open the trigger, pick the option by its visible text. */
async function pick(page: Page, testId: string, option: string | RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

test.describe("PAD-82 one recurring season", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await resetSeason(page);
  });

  test.afterEach(async ({ page }) => {
    await resetSeason(page);
  });

  test("the coach defines the season in Settings and it survives a reload", async ({ page }) => {
    await openCalendarSettings(page);
    await expect(page.getByTestId("season-empty")).toBeVisible();

    await page.getByTestId("season-label").fill("Academy season");
    await pick(page, "season-start-day", "1");
    await pick(page, "season-start-month", "September");
    await pick(page, "season-end-day", "31");
    await pick(page, "season-end-month", "July");

    // Rule 12: the preview reads the current-or-upcoming occurrence.
    await expect(page.getByTestId("season-preview")).toContainText(/season:/i);
    await expect(page.getByTestId("season-preview")).toContainText(/Sep/);
    await expect(page.getByTestId("season-preview")).toContainText(/Jul/);

    const [response] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/season$/.test(r.url()) && r.request().method() === "PUT"),
      page.getByTestId("season-save").click(),
    ]);
    expect(response.status()).toBe(200);
    const saved = (await response.json()) as { startMonth: number; endMonth: number; wrapsYear: boolean; label: string };
    expect(saved).toMatchObject({ startMonth: 9, endMonth: 7, wrapsYear: true, label: "Academy season" });
    await expect(page.getByTestId("season-empty")).toHaveCount(0);

    await page.reload();
    await openCalendarSettings(page);
    await expect(page.getByTestId("season-label")).toHaveValue("Academy season");
    await expect(page.getByTestId("season-start-month")).toContainText(/September/);
    await expect(page.getByTestId("season-end-month")).toContainText(/July/);
    await expect(page.getByTestId("season-remove")).toBeVisible();
  });

  test("an impossible day is rejected inline and nothing changes", async ({ page }) => {
    await openCalendarSettings(page);
    await pick(page, "season-start-day", "31");
    await pick(page, "season-start-month", "April");
    await page.getByTestId("season-save").click();

    await expect(page.getByTestId("season-error")).toContainText(/does not exist in that month/i);
    const res = await page.request.get(`${API_APP}/season`, {
      headers: { Authorization: `Bearer ${await token(page)}` },
    });
    expect(await res.json()).toBeNull();
  });

  test("a class can recur until season end, and removing the season leaves it alone", async ({ page }) => {
    // Define a season that covers today: a full year starting last month.
    const now = new Date();
    const startMonth = ((now.getUTCMonth() + 11) % 12) + 1; // last month, 1-12
    const endMonth = ((startMonth + 10) % 12) + 1; // eleven months later
    const monthName = (m: number) =>
      new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, m - 1, 1)));

    await openCalendarSettings(page);
    await pick(page, "season-start-day", "1");
    await pick(page, "season-start-month", monthName(startMonth));
    await pick(page, "season-end-day", "28");
    await pick(page, "season-end-month", monthName(endMonth));
    await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/season$/.test(r.url()) && r.request().method() === "PUT"),
      page.getByTestId("season-save").click(),
    ]);

    // Create a recurring class that recurs until season end.
    await openCalendar(page);
    await page.getByRole("button", { name: /new class|add class/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /new class/i }).or(page.getByText(/new class/i).first())
    ).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder(/e\.g\./i).first().fill("PAD-82 Season Class");
    const today = now.toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(today);
    await page.getByRole("switch", { name: /^recurring$/i }).click();
    const seasonEndSwitch = page.getByRole("switch", { name: /recurs until season end/i });
    await expect(seasonEndSwitch).toBeVisible({ timeout: 5000 });
    await seasonEndSwitch.click();
    await expect(seasonEndSwitch).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/ends at your season'?s end date/i)).toBeVisible();

    const [created] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/add_class$/.test(r.url())),
      page.getByRole("button", { name: /create class/i }).click(),
    ]);
    expect(created.status()).toBeLessThan(300);
    await expect(page.getByText("PAD-82 Season Class").first()).toBeVisible({ timeout: 10_000 });

    // Rule 7: removing the season keeps the class as it is.
    await openCalendarSettings(page);
    await page.getByTestId("season-remove").click();
    await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/season$/.test(r.url()) && r.request().method() === "DELETE"),
      page.getByTestId("season-remove-confirm").click(),
    ]);
    await expect(page.getByTestId("season-empty")).toBeVisible();
    await openCalendar(page);
    await expect(page.getByText("PAD-82 Season Class").first()).toBeVisible({ timeout: 10_000 });
  });
});
