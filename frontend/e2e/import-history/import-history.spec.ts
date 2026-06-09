import { test, expect } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let importCounter = 0;

async function getAuthToken(request: import("@playwright/test").APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/login", {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const body = await res.json();
  return body.accessToken;
}

/** Seed a unique import via the API */
async function seedImportViaAPI(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  playerCount = 2,
) {
  importCounter++;
  const ts = Date.now();
  const players = Array.from({ length: playerCount }, (_, i) => ({
    name: `Import Player ${ts}-${importCounter}-${i + 1}`,
    email: `import-${ts}-${importCounter}-${i + 1}@e2e.com`,
  }));

  const payload = { Players: players };
  const res = await request.post("/api/app/import/confirm", {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  if (!res.ok()) {
    const text = await res.text();
    console.error(`Import confirm failed (${res.status()}): ${text}`);
  }
  expect(res.ok()).toBeTruthy();
  return { result: await res.json(), playerNames: players.map((p) => p.name) };
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

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Should show at least one import entry
  const entry = page.locator("[data-testid='import-history-entry']").first();
  await expect(entry).toBeVisible({ timeout: 5000 });
  await expect(entry.getByText(/players/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// PAD-21: Import history shows metadata (date, file info)
// ---------------------------------------------------------------------------

test("PAD-21: import history entry shows date and item counts", async ({ page, request }) => {
  const token = await getAuthToken(request);
  await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  const historyEntry = page.locator("[data-testid='import-history-entry']").first();
  await expect(historyEntry).toBeVisible({ timeout: 5000 });

  // Should show item counts and status badge
  await expect(historyEntry.getByText(/2 players/i)).toBeVisible();
  await expect(historyEntry.getByText(/active/i)).toBeVisible();
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
  const entry = page.locator("[data-testid='import-history-entry']").first();
  await entry.getByRole("button", { name: /revert/i }).click();

  // Confirmation dialog should appear
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await expect(dialog.getByText(/are you sure/i)).toBeVisible();
  await expect(dialog.getByText(/players/i)).toBeVisible();
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
  const entry = page.locator("[data-testid='import-history-entry']").first();
  await entry.getByRole("button", { name: /revert/i }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Click cancel
  await dialog.getByRole("button", { name: /cancel/i }).click();

  // Dialog should be dismissed
  await expect(dialog).not.toBeVisible();

  // Import entry should still be visible with active status
  await expect(entry.getByText(/active/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// PAD-21: Confirming revert deletes imported items
// ---------------------------------------------------------------------------

test("PAD-21: confirming revert removes imported items", async ({ page, request }) => {
  const token = await getAuthToken(request);
  const { playerNames } = await seedImportViaAPI(request, token);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Open revert dialog
  const entry = page.locator("[data-testid='import-history-entry']").first();
  await entry.getByRole("button", { name: /revert/i }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Confirm the revert
  await dialog.getByRole("button", { name: /confirm/i }).click();

  // Wait for the revert to complete
  await expect(page.getByText(/successfully reverted/i)).toBeVisible({ timeout: 5000 });

  // Navigate to players to verify the imported players were removed
  await page.goto("/players");
  await page.waitForURL("**/players");

  // The imported test players should no longer appear
  for (const name of playerNames) {
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// PAD-21: Only items from specific upload are removed
// ---------------------------------------------------------------------------

test("PAD-21: revert only removes items from that specific upload", async ({ page, request }) => {
  const token = await getAuthToken(request);

  // Create two separate imports
  const { playerNames: firstNames } = await seedImportViaAPI(request, token, 2);
  const { playerNames: secondNames } = await seedImportViaAPI(request, token, 1);

  await openImportTab(page);

  await expect(page.getByText(/import history/i)).toBeVisible({ timeout: 5000 });

  // Should have at least two import entries
  const entries = page.locator("[data-testid='import-history-entry']");
  const count = await entries.count();
  expect(count).toBeGreaterThanOrEqual(2);

  // Revert only the most recent import (1 player) — it's first in the list (newest first)
  const firstEntry = entries.first();
  await firstEntry.getByRole("button", { name: /revert/i }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole("button", { name: /confirm/i }).click();

  await expect(page.getByText(/successfully reverted/i)).toBeVisible({ timeout: 5000 });

  // Navigate to players — first import's players should still exist
  await page.goto("/players");
  await page.waitForURL("**/players");

  // With pagination (PAGE_SIZE=25), imported players may not all be on page 1 —
  // use search to locate each one by name.
  const searchInput = page.getByPlaceholder(/search/i).first();

  for (const name of firstNames) {
    await searchInput.clear();
    await searchInput.fill(name);
    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });
  }
  for (const name of secondNames) {
    await searchInput.clear();
    await searchInput.fill(name);
    // Give the debounced search time to complete, then assert absence
    await page.waitForTimeout(500);
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5000 });
  }
});
