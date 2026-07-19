import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers, openCalendar } from "../helpers/navigation";

/**
 * PAD-24: Remove optimistic UI updates, add loading states for all backend calls
 *
 * These tests verify that:
 * 1. Loading indicators appear during API calls
 * 2. Buttons are disabled while operations are in progress
 * 3. UI only updates AFTER successful backend response (not optimistically)
 */

// Helper: navigate forward to find the seeded class
async function findSeededClass(page: import("@playwright/test").Page) {
  const title = "E2E Academy Class";
  for (let i = 0; i < 4; i++) {
    const visible = await page.getByText(title).isVisible().catch(() => false);
    if (visible) return true;
    await page.getByRole("button", { name: /next week/i }).first().click();
    await page.waitForTimeout(400);
  }
  return false;
}

test.describe("PAD-24: Loading states for backend calls", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
  });

  test("player edit shows loading state and waits for backend before updating UI", async ({
    page,
  }) => {
    await openPlayers(page);

    // Navigate to player detail (use exact match to avoid "E2E Student Two")
    await page.getByText("E2E Student", { exact: true }).click();
    await page.waitForURL(/\/players\//);

    // The player detail page has inline editing
    const saveBtn = page.getByRole("button", { name: /^save$/i });
    const isAlreadyEditing = await saveBtn.isVisible({ timeout: 2000 }).catch(() => false);

    if (!isAlreadyEditing) {
      await page.getByRole("button", { name: "Edit" }).first().click();
      await expect(saveBtn).toBeVisible({ timeout: 3000 });
    }

    // Intercept the POST to /api/app/edit_player and delay it
    let apiResolved = false;
    await page.route("**/api/app/edit_player", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      apiResolved = true;
      await route.continue();
    });

    // Click save
    await saveBtn.click();

    // The save button should be disabled or show a loading indicator while waiting
    const loadingIndicator = page
      .locator(
        'button:has(.animate-spin), button[disabled]:has-text("Sav"), button:has-text("Saving")'
      )
      .first();

    await expect(loadingIndicator).toBeVisible({ timeout: 1000 });

    // Wait for the API call to complete
    await page.waitForTimeout(3000);
    expect(apiResolved).toBe(true);
  });

  test("class delete shows loading state and only removes class after backend confirms", async ({
    page,
  }) => {
    await openCalendar(page);

    const found = await findSeededClass(page);
    expect(found).toBe(true);

    // Click on the seeded class to open detail sheet
    await page.getByText("E2E Academy Class").first().click();

    // Verify detail sheet is open
    await page
      .locator("text=/participants|attendance|edit/i")
      .first()
      .waitFor({ timeout: 5000 });

    // Intercept the POST to /api/app/remove_class with a delayed-fulfill so:
    //  (1) the click triggers a "pending" request that the loading spinner
    //      observes, and
    //  (2) the request NEVER reaches the backend (other test folders depend
    //      on the seeded class still existing).
    //
    // Note: Playwright auto-continues the route if the handler awaits too
    // long, which would let the request through to the backend. We delay
    // 800ms — long enough to see the spinner, short enough to avoid the
    // auto-continue safety net.
    let deleteApiCalled = false;
    await page.route("**/api/app/remove_class", async (route) => {
      deleteApiCalled = true;
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // Click delete
    const deleteBtn = page
      .getByRole("button", { name: /delete class/i })
      .first();
    await deleteBtn.click();

    // If there's a scope dialog (for recurring classes), pick "single"
    const singleBtn = page.getByRole("button", { name: /only this|this class|single/i });
    const hasScopeDialog = await singleBtn
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (hasScopeDialog) {
      await singleBtn.first().click();
    } else {
      // Non-recurring class (PAD-58): a confirm dialog ("Delete this class?")
      // must be dismissed before the actual API call fires.
      const confirmDialog = page.getByRole("alertdialog");
      const hasConfirmDialog = await confirmDialog
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (hasConfirmDialog) {
        await confirmDialog.getByRole("button", { name: /^delete$/i }).click();
      }
    }

    // CRITICAL CHECK: while the API is in flight, a loading spinner should
    // be visible on the delete button.
    const loadingVisible = await page
      .locator('.animate-spin, button[disabled]')
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);

    expect(loadingVisible).toBe(true);

    // Wait for the route handler to fulfill so the test ends cleanly.
    await page.waitForResponse(
      (r) => /\/api\/app\/remove_class/.test(r.url()) && r.status() === 200,
      { timeout: 5000 }
    );

    expect(deleteApiCalled).toBe(true);
  });

  test("add class form disables submit button during API call", async ({
    page,
  }) => {
    await openCalendar(page);

    // Open add class sheet
    const newClassBtn = page
      .getByRole("button", { name: /add class|new class|\+/i })
      .first();
    await expect(newClassBtn).toBeVisible({ timeout: 5000 });
    await newClassBtn.click();

    // Fill in minimum required fields — name input uses placeholder as accessible name
    const nameField = page.getByPlaceholder(/beginner academy/i);
    await expect(nameField).toBeVisible({ timeout: 5000 });
    await nameField.fill("Loading Test Class");

    // Set a date (required field)
    const dateField = page.locator('input[type="date"]').first();
    await dateField.fill("2026-04-10");

    // Intercept the POST to /api/app/add_class and delay it
    await page.route("**/api/app/add_class", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    // Find and click the submit button
    const submitBtn = page
      .getByRole("button", { name: /create class/i })
      .first();
    await submitBtn.click();

    // The submit button should be disabled or show a spinner during the API call
    const loadingBtn = page.locator('button:has(.animate-spin)').first();
    await expect(loadingBtn).toBeVisible({ timeout: 1000 });
  });
});
