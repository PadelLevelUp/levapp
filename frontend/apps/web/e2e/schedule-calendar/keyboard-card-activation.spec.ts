/**
 * PAD-148 — Calendar class cards must be reachable and activatable by keyboard.
 *
 * The weekly QA sweep (2026-08-30) found the week grid's class cards rendered as
 * bare `generic` nodes in the accessibility tree — no role, no tabindex, no
 * accessible name — so a coach could not open a class, and therefore could not
 * reach attendance, edit, notify or delete, without a mouse.
 *
 * Spec: calendar.view rule 15 / "Calendar class card is reachable and
 * activatable by keyboard". Generalised by compass rule R-026.
 *
 * The card stays a `div` with `role="button"` rather than becoming a native
 * `<button>`: the same element is the HTML5 drag source for calendar.drag-drop,
 * and its subtree contains `div`s and a `role="progressbar"` fill bar that a
 * `<button>` may not legally contain.
 *
 * Run a single test:
 *   npx playwright test e2e/schedule-calendar/keyboard-card-activation.spec.ts
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS_TITLE = "E2E Academy Class";

test.describe("PAD-148: calendar class card keyboard access", () => {
  test("PAD-148: class card is a named button and Enter opens its detail sheet", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS_TITLE)).toBe(true);

    const card = page
      .getByRole("button", { name: new RegExp(CLASS_TITLE, "i") })
      .first();
    await expect(card, "the class card must be exposed as a button").toBeVisible();

    // The accessible name carries the title AND the time range — a week grid
    // holds several classes and the title alone does not identify the slot.
    const name = await card.getAttribute("aria-label");
    expect(name).toContain(CLASS_TITLE);
    expect(name, "accessible name must include the time range").toMatch(
      /\d{1,2}:\d{2}.*\d{1,2}:\d{2}/
    );

    await card.focus();
    expect(
      await card.evaluate((el) => el === document.activeElement),
      "the class card must be focusable"
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("PAD-148: Space activates the focused class card without scrolling", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS_TITLE)).toBe(true);

    const card = page
      .getByRole("button", { name: new RegExp(CLASS_TITLE, "i") })
      .first();
    await card.focus();

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(" ");

    await expect(page.locator('[role="dialog"]').first()).toBeVisible({
      timeout: 5000,
    });
    expect(
      await page.evaluate(() => window.scrollY),
      "Space must be preventDefault()ed so it activates instead of scrolling"
    ).toBe(scrollBefore);
  });
});
