import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

/**
 * PAD-64: A coach must be able to SAVE attendance for a recurring class
 * occurrence, not just a pre-materialized single class.
 *
 * The bug: `POST /api/app/class_instance/presences/confirm` returned 404 for
 * any recurring `Lesson` event because `confirm_presences_service` branched on
 * `'parentClassId' in class_instance_data.keys()` — but the calendar API
 * serializes every event with a `parentClassId` key (null for Lesson events),
 * so recurring occurrences were sent down the LessonInstance path with a Lesson
 * id and `get_or_404` raised 404. The fix branches on the event `model`.
 *
 * The pre-existing `attendance.spec.ts` only *views* the roster, which is why
 * this shipped uncaught — this test actually marks + saves attendance and
 * asserts it persists on reload, for BOTH a materialized single class AND a
 * recurring occurrence.
 */

/**
 * PAD-465 (B-232): other specs can put more students on these shared classes
 * (reminder-flow US-REM-03 leaves e2e-student-2 on "E2E Academy Class"), so
 * every read and click here is scoped to the seeded student's own row, found by
 * its exact name ("E2E Student Two" also contains "E2E Student").
 */
const SEEDED_STUDENT = "E2E Student";

function seededRow(page: Page) {
  return page
    .getByTestId("attendance-row")
    .filter({ has: page.getByText(SEEDED_STUDENT, { exact: true }) });
}

/** Every OTHER row's state, sorted, so a save that touched the wrong row shows. */
async function otherRowStates(page: Page): Promise<string[]> {
  await expect(seededRow(page)).toHaveCount(1, { timeout: 5000 });
  const others = page
    .getByTestId("attendance-row")
    .filter({ hasNot: page.getByText(SEEDED_STUDENT, { exact: true }) });
  const states: string[] = [];
  for (let i = 0; i < (await others.count()); i++) {
    states.push(
      (await others.nth(i).getByTestId("attendance-state").getAttribute("data-state")) ?? ""
    );
  }
  return states.sort();
}

/**
 * Open the class with `title`, mark the seeded student Present, save, and
 * assert the save succeeded (no "Failed to save attendance"). Returns the other
 * rows' states from before the save.
 */
async function markPresentAndSave(
  page: Page,
  title: string
): Promise<string[]> {
  const found = await findClassOnCalendar(page, title);
  expect(found, `Expected to find "${title}" on the calendar`).toBe(true);

  await page.getByText(title).first().click();
  const othersBefore = await otherRowStates(page);

  // Enter attendance-marking mode. The button reads "Mark attendance" the first
  // time and "Edit attendance" once presences exist.
  const markBtn = page
    .getByRole("button", { name: /mark attendance|edit attendance/i })
    .first();
  await expect(markBtn).toBeVisible({ timeout: 5000 });
  await markBtn.click();

  // Mark the seeded student Present, on their own row.
  await seededRow(page).getByRole("button", { name: /^present$/i }).click();

  // Confirm/save — wait for the actual confirm call to resolve 200 (the fix).
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/class_instance\/presences\/confirm$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 10_000 }
    ),
    page.getByRole("button", { name: /^confirm$/i }).click(),
  ]);
  expect(
    resp.status(),
    `presences/confirm should return 200 for "${title}" (was ${resp.status()})`
  ).toBe(200);

  const saveToast = page.getByTestId("toast");
  await expect(saveToast).toBeVisible({ timeout: 5000 });
  await expect(saveToast).toHaveAttribute("data-variant", "default");
  return othersBefore;
}

/**
 * Reload, reopen the class, and assert the saved status persisted.
 *
 * PAD-313: the row now carries ONE state word, asserted by `data-state` rather
 * than by its text — the app renders in pt, so an English assertion only ever
 * passed here because this one string happened to be untranslated.
 *
 * The expected value is `attended`: `add_presences` ends with
 * `values["validated"] = True` — "attendance was explicitly recorded by the
 * coach" — so saving from the class sheet IS the coach's record, not the
 * student's intent (`attendance.presence` rule 9). Before the save the seeded
 * row is unanswered, so `planned`, which is what makes this assertion still
 * distinguish a saved row from an unsaved one.
 */
async function assertPresentPersists(
  page: Page,
  title: string,
  othersBefore: string[]
): Promise<void> {
  await page.reload();
  await openCalendar(page);

  const found = await findClassOnCalendar(page, title);
  expect(found, `Expected "${title}" still on the calendar after reload`).toBe(
    true
  );
  await page.getByText(title).first().click();

  const state = seededRow(page).getByTestId("attendance-state");
  await expect(
    state,
    `the saved attendance state should persist for "${title}" after reload`
  ).toBeVisible({ timeout: 5000 });
  await expect(state).toHaveAttribute("data-state", "attended");
  // Nobody else's row changed: the save was the seeded student's alone.
  expect(await otherRowStates(page)).toEqual(othersBefore);
}

test.describe("PAD-64: attendance can be saved for single and recurring classes", () => {
  test.beforeEach(async ({ page }) => {
    // Desktop viewport so the class-detail sheet renders the full participant
    // roster + attendance controls.
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsCoach(page);
    await openCalendar(page);
  });

  test("US-20: save attendance for a materialized single class instance", async ({
    page,
  }) => {
    const others = await markPresentAndSave(page, "E2E Academy Class");
    await assertPresentPersists(page, "E2E Academy Class", others);
  });

  test("PAD-64: save attendance for a recurring class occurrence (was 404)", async ({
    page,
  }) => {
    const others = await markPresentAndSave(page, "E2E Recurring Class");
    await assertPresentPersists(page, "E2E Recurring Class", others);
  });
});
