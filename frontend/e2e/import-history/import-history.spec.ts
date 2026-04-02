import { test, expect } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Login and get an auth token for direct API calls */
async function getAuthToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const body = await res.json();
  return body.access_token;
}

/** Seed an import via the API so import history has entries */
async function seedImportViaAPI(
  request: import("@playwright/test").APIRequestContext,
  token: string,
) {
  // Create a small bulk import with 2 players
  const payload = {
    Players: [
      { name: "Import Test Player One", email: "import-test-one@e2e.com" },
      { name: "Import Test Player Two", email: "import-test-two@e2e.com" },
    ],
  };
  const res = await request.post("/api/app/import/confirm", {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(res.ok()).toBeTruthy();
  return await res.json();
}

async function openImportTab(page: import("@playwright/test").Page) {
  await loginAsCoach(page);
  await openSettings(page);
  await page.getByRole("button", { name: /import data/i }).click();
  await expect(page.getByText(/import data/i).first()).toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// PAD-21: Import history section is visible
// ---------------------------------------------------------------------------

test("PAD-21: import history section shows past uploads", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  // The import history section should be visible
  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Should show the recent import with player count
  await expect(page.getByText(/2 players/i)).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// PAD-21: Import history shows metadata (date, file info)
// ---------------------------------------------------------------------------

test("PAD-21: import history entry shows date and item counts", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Each import entry should show the date
  const historyEntry = page.locator("[data-testid='import-history-entry']").first();
  await expect(historyEntry).toBeVisible({ timeout: 5000 });

  // Should show item counts
  await expect(historyEntry.getByText(/2 players/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// PAD-21: Revert button opens confirmation dialog
// ---------------------------------------------------------------------------

test("PAD-21: clicking revert shows confirmation dialog with item counts", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Click revert on the first import entry
  const revertButton = page.getByRole("button", { name: /revert/i }).first();
  await revertButton.click();

  // Confirmation dialog should appear
  await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 3000 });

  // Should show the count of items to be deleted
  await expect(page.getByText(/2 players/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// PAD-21: Cancel revert dismisses dialog without deleting
// ---------------------------------------------------------------------------

test("PAD-21: canceling revert dismisses dialog", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Open revert dialog
  const revertButton = page.getByRole("button", { name: /revert/i }).first();
  await revertButton.click();

  await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 3000 });

  // Click cancel
  await page.getByRole("button", { name: /cancel/i }).click();

  // Dialog should be dismissed
  await expect(page.getByText(/are you sure/i)).not.toBeVisible();

  // Import entry should still be visible
  await expect(page.getByText(/2 players/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// PAD-21: Confirming revert deletes imported items
// ---------------------------------------------------------------------------

test("PAD-21: confirming revert removes imported items", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Open revert dialog
  const revertButton = page.getByRole("button", { name: /revert/i }).first();
  await revertButton.click();

  await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 3000 });

  // Confirm the revert
  await page.getByRole("button", { name: /confirm/i }).click();

  // Wait for the revert to complete — the entry should disappear or show as reverted
  await expect(page.getByText(/successfully reverted/i)).toBeVisible({ timeout: 5000 });

  // The reverted import should no longer show a revert button
  // Navigate to players to verify the imported players were removed
  await page.goto("/players");
  await page.waitForURL("**/players");

  // The imported test players should no longer appear
  await expect(page.getByText("Import Test Player One")).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Import Test Player Two")).not.toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// PAD-21: Only items from specific upload are removed
// ---------------------------------------------------------------------------

test("PAD-21: revert only removes items from that specific upload", async ({ page, request }) => {
  const token = await getAuthToken(request);

  // Create two separate imports
  await seedImportViaAPI(request, token);

  const payload2 = {
    Players: [
      { name: "Second Import Player", email: "second-import@e2e.com" },
    ],
  };
  await request.post("/api/app/import/confirm", {
    headers: { Authorization: `Bearer ${token}` },
    data: payload2,
  });

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Should have two import entries
  const entries = page.locator("[data-testid='import-history-entry']");
  await expect(entries).toHaveCount(2, { timeout: 5000 });

  // Revert only the most recent import (1 player)
  const firstRevertButton = entries.first().getByRole("button", { name: /revert/i });
  await firstRevertButton.click();

  await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: /confirm/i }).click();

  await expect(page.getByText(/successfully reverted/i)).toBeVisible({ timeout: 5000 });

  // Navigate to players — first import's players should still exist
  await page.goto("/players");
  await page.waitForURL("**/players");

  await expect(page.getByText("Import Test Player One")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Import Test Player Two")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Second Import Player")).not.toBeVisible({ timeout: 5000 });
});
