import { test, expect, type Page } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";

// PAD-28: student calendar blockers that prevent auto-invitations.
// PAD-356 (calendar.student-blockers rules 14–16): the availability tab is two
// cards (Indisponibilidade, Pedidos de aula) with no floating or header "+",
// and blocks are created in a sheet: single or recurring, an optional reason,
// and an end that must come after the start. Test ids only, never copy.

test.beforeEach(async ({ page }) => {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.waitForURL("**/availability");
  await expect(page.getByTestId("availability-blockers-card")).toBeVisible({ timeout: 10_000 });
});

/** A far-future date so the blocker never collides with seeded classes. */
function futureDate(offsetDays: number): string {
  const d = new Date(Date.UTC(2031, 0, 6 + offsetDays)); // 2031-01-06 is a Monday
  return d.toISOString().slice(0, 10);
}

async function openSheet(page: Page) {
  await page.getByTestId("availability-create-blocker").click();
  await expect(page.getByTestId("blocker-sheet")).toBeVisible();
}

async function saveAndReadId(page: Page): Promise<number> {
  const created = page.waitForResponse(
    (r) => /\/api\/app\/availability_blockers(\?|$)/.test(r.url()) && r.request().method() === "POST"
  );
  await page.getByTestId("blocker-save").click();
  const res = await created;
  expect(res.status()).toBeLessThan(300);
  const id = Number((await res.json()).id);
  expect(id, "the create response carries the blocker id").toBeGreaterThan(0);
  await expect(page.getByTestId("blocker-sheet")).toHaveCount(0);
  return id;
}

async function deleteBlocker(page: Page, id: number) {
  await page.getByTestId(`blocker-delete-${id}`).click();
  await page.getByTestId("blocker-delete-confirm").click();
  await expect(page.getByTestId(`blocker-card-${id}`)).toHaveCount(0, { timeout: 10_000 });
}

test("PAD-356: the tab is two cards with their own actions and no floating +", async ({ page }) => {
  const blockers = page.getByTestId("availability-blockers-card");
  const requests = page.getByTestId("class-requests");
  await expect(blockers.getByTestId("availability-create-blocker")).toBeVisible();
  await expect(requests).toBeVisible();
  await expect(requests.getByTestId("class-request-book")).toBeVisible();
  // The blockers card comes first.
  const [b, r] = await Promise.all([blockers.boundingBox(), requests.boundingBox()]);
  expect(b!.y).toBeLessThan(r!.y);
  // No floating action button anywhere on the page.
  await expect(page.getByTestId("availability-add")).toHaveCount(0);
  const fixed = await page.evaluate(
    () => [...document.querySelectorAll("button")].filter((el) => getComputedStyle(el).position === "fixed").length
  );
  expect(fixed, "no fixed-position (floating) button on the page").toBe(0);
});

test("PAD-356: a single block with a reason is created from the sheet, listed, and deleted", async ({ page }) => {
  await openSheet(page);
  await expect(page.getByTestId("blocker-mode-single")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("blocker-date").fill(futureDate(1));
  await page.getByTestId("blocker-start-time").fill("18:00");
  await page.getByTestId("blocker-end-time").fill("20:00");
  await page.getByTestId("blocker-reason").fill("PAD-356 single reason");
  const id = await saveAndReadId(page);

  const row = page.getByTestId("availability-blockers-card").getByTestId(`blocker-card-${id}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("PAD-356 single reason"); // test data, not copy
  await deleteBlocker(page, id);
});

test("PAD-356: a recurring block on chosen weekdays between two dates is created", async ({ page }) => {
  await openSheet(page);
  await page.getByTestId("blocker-mode-recurring").click();
  await page.getByTestId("blocker-day-2").click();
  await page.getByTestId("blocker-day-4").click();
  await page.getByTestId("blocker-date").fill(futureDate(0));
  await page.getByTestId("blocker-end-date").fill(futureDate(56));
  await page.getByTestId("blocker-start-time").fill("07:00");
  await page.getByTestId("blocker-end-time").fill("08:30");

  const created = page.waitForRequest(
    (r) => /\/api\/app\/availability_blockers(\?|$)/.test(r.url()) && r.method() === "POST"
  );
  const idPromise = saveAndReadId(page);
  const payload = (await created).postDataJSON();
  expect(payload).toMatchObject({
    isRecurring: true,
    recurrenceRule: { frequency: "weekly", daysOfWeek: [2, 4] },
    date: futureDate(0),
    endDate: futureDate(56),
    startTime: "07:00",
    endTime: "08:30",
    title: null,
  });
  const id = await idPromise;
  await expect(page.getByTestId(`blocker-card-${id}`)).toBeVisible({ timeout: 10_000 });
  await deleteBlocker(page, id);
});

test("PAD-356: an end before the start is refused in the sheet and nothing is sent", async ({ page }) => {
  let posted = 0;
  page.on("request", (r) => {
    if (/\/api\/app\/availability_blockers(\?|$)/.test(r.url()) && r.method() === "POST") posted += 1;
  });
  await openSheet(page);
  await page.getByTestId("blocker-date").fill(futureDate(2));
  await page.getByTestId("blocker-start-time").fill("20:00");
  await page.getByTestId("blocker-end-time").fill("19:00");
  await page.getByTestId("blocker-save").click();
  await expect(page.getByTestId("blocker-error")).toHaveAttribute("data-reason", "end_before_start");

  await page.getByTestId("blocker-mode-recurring").click();
  await page.getByTestId("blocker-end-time").fill("21:00");
  await page.getByTestId("blocker-end-date").fill(futureDate(1));
  await page.getByTestId("blocker-save").click();
  await expect(page.getByTestId("blocker-error")).toHaveAttribute("data-reason", "end_date_before_start_date");

  await expect(page.getByTestId("blocker-sheet")).toBeVisible();
  expect(posted, "no blocker request was sent for an invalid draft").toBe(0);
  await page.getByTestId("blocker-cancel").click();
  await expect(page.getByTestId("blocker-sheet")).toHaveCount(0);
});
