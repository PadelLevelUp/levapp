import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

/**
 * PAD-71 — the weekly calendar's `X/Y` participant badge must show EFFECTIVE
 * filled spots (enrolled minus declined), not the raw enrolment count, and it
 * must match the "capacity" field inside the class detail sheet.
 *
 * Seed fixture: "E2E Declined Count Class" (next Thursday 16:00) has 4 spots and
 * 3 enrolled players, 2 of whom declined (presence.status == "absent").
 * Expected on BOTH surfaces: 1/4.
 */

const CLASS_TITLE = "E2E Declined Count Class";
const EXPECTED_COUNT = "1/4";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

test("PAD-71: calendar event card excludes declined students from the participant count", async ({
  page,
}) => {
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: CLASS_TITLE })
    .first();
  await expect(card).toBeVisible({ timeout: 5000 });

  // 3 enrolled, 2 declined, 4 spots → 1/4 (NOT 3/4).
  await expect(card).toContainText(EXPECTED_COUNT);
  await expect(card).not.toContainText("3/4");
});

test("PAD-71: calendar count matches the class detail capacity field", async ({
  page,
}) => {
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: CLASS_TITLE })
    .first();
  await expect(card).toContainText(EXPECTED_COUNT);

  await card.click();

  // The detail sheet's "Capacity" tile renders the same effective value.
  const capacityLabel = page.getByText(/^capacity$/i).first();
  await expect(capacityLabel).toBeVisible({ timeout: 10_000 });

  const capacityTile = capacityLabel.locator("xpath=ancestor::div[1]/..");
  await expect(capacityTile).toContainText(EXPECTED_COUNT);
});

test("PAD-71: classes with no declines still show the full enrolment count", async ({
  page,
}) => {
  // "E2E Academy Class" has 1 enrolled student who has NOT responded — an
  // unanswered invite still occupies a spot, so the count stays 1/6.
  const found = await findClassOnCalendar(page, "E2E Academy Class");
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: "E2E Academy Class" })
    .first();
  await expect(card).toContainText("1/6");
});
