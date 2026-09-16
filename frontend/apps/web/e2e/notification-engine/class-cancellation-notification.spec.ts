import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openCalendar, openMessages } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

// PAD-75: When a coach cancels/deletes a scheduled class that has an enrolled
// student, the student must automatically receive an in-app cancellation
// notification (a message in their coach<->student conversation), delivered via
// the same channel used for other class notifications.
//
// This spec creates its OWN class (so it never mutates the shared seeded
// "E2E Academy Class"), enrols the seeded student "E2E Student", cancels it as
// the coach, then verifies the student receives the cancellation message.

const STUDENT_NAME = "E2E Student";
const COACH_NAME = "E2E Coach";

async function findClass(page: import("@playwright/test").Page, title: string) {
  for (let i = 0; i < 4; i++) {
    try {
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 3000 });
      return true;
    } catch {
      await page.getByRole("button", { name: ui("calendar.toolbar.nextWeek") }).first().click();
      await page.waitForTimeout(300);
    }
  }
  return false;
}

test("PAD-75: enrolled student is notified when the coach cancels a class", async ({ page }) => {
  const title = `Cancel Notify ${Date.now()}`;

  // --- Coach: create a class with the seeded student enrolled ---
  await loginAsCoach(page);
  await openCalendar(page);

  await page.getByRole("button", { name: ui("calendar.toolbar.addClass") }).first().click();
  await page.getByPlaceholder(/beginner academy|private/i).first().fill(title);

  // Enrol the student via the PlayerSelector "All" tab.
  await page.getByRole("tab", { name: ui("calendar.playerSelector.all") }).first().click();
  const search = page.getByPlaceholder(/search/i).last();
  await search.fill(STUDENT_NAME);
  // Scoped to the add-class sheet: unscoped, this intermittently resolved to a
  // <p> behind the overlay after class-requests/ ran and timed out (Session C,
  // #295). The name is test data, not copy.
  await page.getByRole("dialog").getByText(STUDENT_NAME, { exact: true }).first().click();

  await page.getByRole("button", { name: ui("calendar.addClass.createClass") }).click();
  await page.waitForTimeout(800);

  const found = await findClass(page, title);
  expect(found).toBe(true);

  // --- Coach: cancel/delete the class ---
  await page.getByText(title).first().click();
  const deleteBtn = page.getByRole("dialog").getByRole("button", { name: ui("calendar.detail.deleteClass") }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });
  await deleteBtn.click();

  // Non-recurring class → confirm dialog.
  const confirmDialog = page.getByRole("alertdialog");
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  await confirmDialog.getByRole("button", { name: ui("calendar.detail.delete") }).click();

  await expect(page.getByText("Class deleted", { exact: true })).toBeVisible({ timeout: 5000 });

  // --- Student: verify the cancellation notification arrived ---
  await page.context().clearCookies();
  await loginAsStudent(page);
  await openMessages(page);

  // Open the conversation with the coach.
  await page.getByText(COACH_NAME).first().click();
  await page.waitForResponse(
    (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );

  // The cancellation message body ("...has been cancelled...") is visible.
  await expect(page.getByText(/cancell?ed/i).last()).toBeVisible({ timeout: 10_000 });
});
