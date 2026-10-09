/**
 * PAD-525 (classes.edit rule 10; B-341): an edit belongs to one class on one opening of the
 * sheet. Closing the sheet mid-edit asks "Descartar alterações?" (Discard / Keep editing — no
 * Save, see the rule); Discard drops the draft, and the next class opens in view mode with its
 * own values. Before the fix the sheet stayed mounted with `isEditing` and the old draft, and
 * class B rendered class A's typed name under a Save button.
 *
 * Locators by test id (R-013). Two one-off classes are made through the API on a free day and
 * removed afterwards.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { openCalendar } from "../helpers/navigation";

const NAME_A = "PAD-525 class A";
const NAME_B = "PAD-525 class B";
const TYPED = "PAD-525 A changed";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

async function addClass(request: APIRequestContext, auth: Record<string, string>, name: string, day: string, start: string, end: string) {
  const res = await request.post(`${API_ROOT}/app/add_class`, {
    headers: auth,
    data: { name, classType: "academy", maxPlayers: 4, date: day, startTime: start, endTime: end, isRecurring: false },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("PAD-525: an edit never follows the coach to another class", () => {
  // 9 days out: never today's week collision, never the seeded Monday's.
  const day = new Date(Date.now() + 9 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  test.beforeEach(async ({ request }) => {
    const auth = await coachAuth(request);
    await removeClassesOnDay(request, auth, day, (e) => e.title.startsWith("PAD-525"));
    await addClass(request, auth, NAME_A, day, "09:00", "10:00");
    await addClass(request, auth, NAME_B, day, "11:00", "12:00");
  });

  test.afterEach(async ({ request }) => {
    const auth = await coachAuth(request);
    await removeClassesOnDay(request, auth, day, (e) => e.title.startsWith("PAD-525"));
  });

  async function openClassAndEdit(page: import("@playwright/test").Page, name: string) {
    expect(await findClassOnCalendar(page, name)).toBe(true);
    await page.getByText(name, { exact: true }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await expect(save).toBeVisible();
    return sheet;
  }

  test("closing mid-edit asks; Keep editing keeps the draft; Discard drops it and the next class opens clean", async ({ page, request }) => {
    test.setTimeout(150_000);
    await loginAsCoach(page);
    await openCalendar(page);

    const sheet = await openClassAndEdit(page, NAME_A);
    const nameInput = sheet.getByTestId("class-edit-name");
    await nameInput.fill(TYPED);

    // Escape is one of the sheet's closes. With an unsaved change it asks instead of closing.
    await page.keyboard.press("Escape");
    const dialog = page.getByTestId("class-unsaved-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("class-unsaved-keep").click();
    await expect(dialog).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(nameInput).toHaveValue(TYPED);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.getByTestId("class-unsaved-discard").click();
    await expect(dialog).toHaveCount(0);
    await expect(sheet).toHaveCount(0);

    // Nothing was sent: A keeps its saved name.
    const auth = await coachAuth(request);
    const events = await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
    const titles = ((await events.json()) as { title: string }[]).map((e) => e.title);
    expect(titles).toContain(NAME_A);
    expect(titles).not.toContain(TYPED);

    // The next class opens in view mode with its own values — the defect of B-341.
    await page.getByText(NAME_B, { exact: true }).first().click();
    const sheetB = page.getByRole("dialog");
    await expect(sheetB).toBeVisible();
    await expect(sheetB.getByTestId("class-edit")).toBeVisible();
    await expect(sheetB.getByTestId("class-edit-save")).toHaveCount(0);
    await expect(sheetB.getByTestId("class-edit-name")).toHaveCount(0);
    await expect(sheetB.getByTestId("class-detail-title")).toHaveText(NAME_B);
  });

  test("nothing unsaved, nothing asked: an untouched edit closes at once and reopens in view mode", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsCoach(page);
    await openCalendar(page);

    const sheet = await openClassAndEdit(page, NAME_A);
    const nameInput = sheet.getByTestId("class-edit-name");
    await nameInput.fill(TYPED);
    await nameInput.fill(NAME_A); // typed back: clean by value
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("class-unsaved-dialog")).toHaveCount(0);
    await expect(sheet).toHaveCount(0);

    await page.getByText(NAME_A, { exact: true }).first().click();
    const again = page.getByRole("dialog");
    await expect(again).toBeVisible();
    await expect(again.getByTestId("class-edit")).toBeVisible();
    await expect(again.getByTestId("class-edit-save")).toHaveCount(0);
  });
});
