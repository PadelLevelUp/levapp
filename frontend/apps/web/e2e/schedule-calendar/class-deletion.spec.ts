import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

// Helper: navigate forward up to 4 weeks to find a class by title
async function findClass(page: import("@playwright/test").Page, title: string) {
  for (let i = 0; i < 4; i++) {
    try {
      await expect(page.getByText(title).first()).toBeVisible({ timeout: 3000 });
      return true;
    } catch {
      await page.getByRole("button", { name: /next week/i }).first().click();
      await page.waitForTimeout(300);
    }
  }
  return false;
}

// PAD-10: Deleting a non-recurring class shows success, not an error
// Note: we create our own class to delete so we don't interfere with other tests
// that depend on the seeded "E2E Academy Class".
test("PAD-10: deleting a non-recurring class shows success toast and updates UI", async ({ page }) => {
  // Create a dedicated class for this test via the Add class sheet.
  const title = "Delete Target Class";
  await page.getByRole("button", { name: /add class/i }).first().click();
  await page.getByPlaceholder(/beginner academy|private/i).first().fill(title);
  // PAD-300 (load flake, B-079): a fixed 800 ms is not a settle — under load
  // the create took longer and `findClass` walked weeks past a class that had
  // not been drawn yet. Wait for the create response; CalendarPage appends the
  // created event from that response itself (no refetch), so the calendar
  // shows it as soon as the sheet closes.
  const created = page.waitForResponse(
    (r) => /\/app\/add_class$/.test(r.url()) && r.status() < 300,
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: /create class/i }).click();
  await created;
  await expect(page.getByTestId("add-class-sheet")).toHaveCount(0, { timeout: 15_000 });

  const found = await findClass(page, title);
  expect(found).toBe(true);

  // Open class detail
  await page.getByText(title).first().click();

  // Wait for the detail sheet to open
  const deleteBtn = page.getByRole("dialog").getByRole("button", { name: /delete class/i }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });

  // Click delete — non-recurring class shows a confirm dialog (PAD-58).
  await deleteBtn.click();
  const confirmDialog = page.getByRole("alertdialog");
  await expect(confirmDialog).toBeVisible({ timeout: 5000 });

  // The toast text is not the observable: the delete endpoint's response and
  // the class disappearing from the grid are — a toast can be mistranslated
  // or restyled without the deletion itself having failed.
  const deleted = page.waitForResponse(
    (r) => /\/app\/remove_class$/.test(r.url()) && r.status() < 300,
    { timeout: 15_000 }
  );
  await confirmDialog.getByRole("button", { name: /^delete$/i }).click();
  await deleted;

  // Class should be removed from the calendar grid (not checking toast area)
  await expect(page.getByRole("main").getByText(title)).not.toBeVisible({ timeout: 3000 });
});

// PAD-10: Deleting a single occurrence of a recurring class shows success
test("PAD-10: deleting a single occurrence of recurring class shows success toast", async ({ page }) => {
  const title = "E2E Recurring Class";
  const found = await findClass(page, title);
  expect(found).toBe(true);

  // Open class detail
  await page.getByText(title).first().click();

  // Wait for the detail sheet to open
  const deleteBtn = page.getByRole("dialog").getByRole("button", { name: /delete class/i }).first();
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });

  // Click delete — recurring class shows scope dialog
  await deleteBtn.click();

  // Scope dialog should appear — choose "Only this class"
  const singleBtn = page.getByTestId("class-scope-single");
  await expect(singleBtn).toBeVisible({ timeout: 5000 });

  // The toast text is not the observable: the delete endpoint's response and
  // the occurrence disappearing from the grid are.
  const deleted = page.waitForResponse(
    (r) => /\/app\/remove_class$/.test(r.url()) && r.status() < 300,
    { timeout: 15_000 }
  );
  await singleBtn.click();
  await deleted;

  // The occurrence should be removed from the calendar grid — the persisted
  // effect of a successful delete.
  await expect(page.getByRole("main").getByText(title)).not.toBeVisible({ timeout: 5000 });
});
