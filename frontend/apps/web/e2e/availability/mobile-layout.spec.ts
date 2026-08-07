import { test, expect, type Page } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";

/**
 * PAD-119: the student Availability tab must fit a mobile viewport.
 *
 * Spec: calendar.student-blockers rule 13 — at small widths the page must never
 * scroll horizontally and every control, notably "Add blocker", must be fully
 * inside the viewport.
 *
 * Three things this test does deliberately, because the naive version of each
 * makes the test pass while the bug is still there:
 *
 * 1. It runs in **Portuguese**. The E2E users are seeded `language: "en"`, but
 *    pt is the app's default locale and the one the reporter uses, and the pt
 *    strings ("Disponibilidade" / "Adicionar bloqueio") are much wider than the
 *    en ones — wide enough to overflow where en fits. The locale is forced by
 *    rewriting `GET /api/auth/me`, not through Settings: the language switch
 *    hangs under a mobile viewport and would also leak pt into the shared seed
 *    DB for every later spec.
 * 2. It measures **`<main>`**, not `documentElement`. AppLayout pins the shell
 *    to `h-[100dvh] overflow-hidden` and scrolls inside `<main>`, so the
 *    document never reports a horizontal scroll no matter how far the content
 *    overflows.
 * 3. It asserts **geometry**, not `toBeVisible()`. Playwright considers a
 *    horizontally clipped element visible, which is exactly the bug.
 */

const VIEWPORT = { width: 375, height: 812 };

test.use({ viewport: VIEWPORT });

const MOCK_BLOCKERS = [
  {
    id: 9119,
    userId: 0,
    type: "unavailable",
    title: "Indisponível por viagem de trabalho prolongada",
    description: null,
    isRecurring: true,
    recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3, 5] },
    recurrenceEnd: "2026-12-31",
    blocksAutoInvitations: true,
    date: "2026-08-17",
    startTime: "18:00",
    endTime: "20:00",
  },
];

/** The scrolling content area must fit the viewport — no horizontal scrollbar. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth };
  });
  expect(
    scrollWidth,
    `${label}: content scrolls horizontally (${scrollWidth}px of content in a ${clientWidth}px viewport)`
  ).toBeLessThanOrEqual(clientWidth);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/app/availability_blockers", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BLOCKERS),
      });
      return;
    }
    await route.continue();
  });

  // Render the app in Portuguese without touching Settings or the seed DB.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      body: JSON.stringify({ ...body, language: "pt" }),
    });
  });

  await loginAsStudent(page);
  await page.goto("/availability");
  await page.waitForURL("**/availability");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Disponibilidade" })
  ).toBeVisible({ timeout: 10_000 });
});

test("US-PAD119: availability page fits the mobile viewport", async ({
  page,
}) => {
  // The mocked blocker must have rendered, otherwise we would be measuring an
  // empty page and the assertions would be vacuous. Assert attachment rather
  // than visibility: when the row overflows, the truncating title collapses to
  // zero width and Playwright reports it hidden — that is the bug, not a
  // reason to stop measuring.
  await expect(page.getByText(/viagem de trabalho prolongada/)).toBeAttached({
    timeout: 10_000,
  });

  await expectNoHorizontalOverflow(page, "availability page");

  const addBlocker = page.getByRole("button", { name: "Adicionar bloqueio" });
  const box = await addBlocker.boundingBox();
  expect(box, "Add blocker button has no layout box").not.toBeNull();
  expect(
    box!.x,
    "Add blocker button starts off the left edge"
  ).toBeGreaterThanOrEqual(0);
  expect(
    box!.x + box!.width,
    `Add blocker button overflows the viewport (right edge at ${
      box!.x + box!.width
    }px in a ${VIEWPORT.width}px viewport)`
  ).toBeLessThanOrEqual(VIEWPORT.width);
});

test("US-PAD119: blocker list row fits the mobile viewport", async ({
  page,
}) => {
  const title = page.getByText(/viagem de trabalho prolongada/);
  await expect(title).toBeAttached({ timeout: 10_000 });

  // The title + "Recorrente" + "Indisponível" cluster used to be a non-wrapping
  // flex row that clipped its own badges. No container inside the blocker row
  // may hide content it can't fit. (The title <p> itself is allowed to
  // truncate — that's the intended treatment for a long single line — so only
  // the layout divs are measured.)
  const clipped = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("main p")).find((p) =>
      /viagem de trabalho prolongada/.test(p.textContent || "")
    );
    const row = heading?.closest("div.rounded-lg.border") as HTMLElement | null;
    if (!row) return null;
    return [row, ...Array.from(row.querySelectorAll("div"))]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({
        cls: (el.className || "").toString().slice(0, 60),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
  });
  expect(clipped, "blocker row not found — assertion would be vacuous").not.toBeNull();
  expect(
    clipped,
    `containers in the blocker row clip their own content: ${JSON.stringify(clipped)}`
  ).toEqual([]);
});

test("US-PAD119: blocker form fits the mobile viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Adicionar bloqueio" }).click();

  // Recurring mode renders the widest rows on the page: the seven day-initial
  // buttons plus the "repeat until" field.
  await page.getByLabel(/recorrente semanalmente/i).click();
  await expect(page.getByLabel(/repetir até/i)).toBeVisible({
    timeout: 5_000,
  });

  await expectNoHorizontalOverflow(page, "availability page with form open");
});
