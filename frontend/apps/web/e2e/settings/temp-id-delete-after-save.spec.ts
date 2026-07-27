import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings, openPlayers } from "../helpers/navigation";

// PAD-101: Newly-added, not-yet-persisted rows are keyed with a temporary id
// (coach levels: the string `new-<Date.now()>`; strengths/weaknesses: the
// negative number `-Date.now()`). After a successful save the component kept
// the temp id instead of adopting the server's real numeric id, so deleting a
// just-added row (before any reload) sent a bogus id to the delete endpoint.
// The backend `int(...)` on the id then 500'd (coach levels) or the fake id
// 404'd (notes) — either way the delete silently failed.
//
// These tests pin the fix at the network level: the delete request that goes
// out for a just-saved / just-added row must come back 2xx. A DOM-only
// assertion ("row disappeared") could pass on a wrong optimistic fix while the
// server still rejected the call, so we assert the response status directly.
test.describe("PAD-101: just-added rows are deletable without a reload", () => {
  test("US-101: delete a coach level right after saving it (no reload)", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await openSettings(page);
    // CoachLevelsSection lives in the "Preferences" tab of SettingsPage.
    await page.getByRole("button", { name: /^preferences$/i }).first().click();
    await expect(
      page.getByRole("heading", { name: /coach levels/i })
    ).toBeVisible({ timeout: 10000 });

    const rows = page.getByTestId("coach-level-row");
    const seededCount = await rows.count();

    // Add a brand-new row and give it a unique code/label so the upsert keys on
    // something that won't collide with the seeded ladder.
    await page.getByRole("button", { name: /add level/i }).click();
    const uniqueCode = `D${Date.now().toString().slice(-6)}`;
    await rows.last().locator("input").first().fill(uniqueCode);
    await rows.last().locator("input").nth(1).fill("Temp delete me");

    // Save. Wait for the save round-trip to actually land so local state has
    // had its chance to (re)adopt the server ids.
    await page.getByRole("button", { name: /save levels/i }).click();
    // The fix refetches the ladder after save and re-renders the rows with their
    // real numeric ids. The success toast is dispatched in the same tick as that
    // state update, so its appearance is a reliable signal the re-keyed rows have
    // flushed to the DOM — click before that and we'd grab the stale temp-id row.
    await expect(page.getByText(/levels saved/i).first()).toBeVisible({ timeout: 10000 });

    // Now delete that same row WITHOUT reloading. On main the temp string id
    // (`new-…`) is still attached → backend int() → HTTP 500.
    const deleteResp = page.waitForResponse((r) =>
      r.url().includes("/delete/coach_level")
    );
    // Row buttons: [drag grip, delete]. The trash button is rendered last.
    await rows.last().getByRole("button").last().click();

    expect((await deleteResp).status()).toBe(200);
    // And the just-added row is gone from the UI — back to the seeded count.
    await expect(rows).toHaveCount(seededCount, { timeout: 5000 });
  });

  test("US-101: delete a just-added strength (no reload)", async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);

    await page.getByText("E2E Student", { exact: true }).click();
    await page.waitForURL(/\/players\/\d+/, { timeout: 8000 });

    // Enter the Strengths & Weaknesses edit mode (its own "Edit" toggle is the
    // last one on the page).
    await expect(
      page.getByText(/strengths.*weaknesses/i).first()
    ).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /^edit$/i }).last().click();

    // Add a strength. The optimistic note is appended to local state with a
    // temp id (`-Date.now()` on main).
    const uniqueText = `Temp strength ${Date.now()}`;
    await page.getByPlaceholder("Add a strength...").fill(uniqueText);
    const addResp = page.waitForResponse((r) =>
      r.url().includes("/add_coach_note")
    );
    await page.getByRole("button", { name: /^add strength$/i }).click();
    await addResp;

    const newItem = page.getByRole("listitem").filter({ hasText: uniqueText });
    await expect(newItem).toBeVisible({ timeout: 5000 });

    // Delete it WITHOUT reloading. On main the fake id is sent → 404.
    const deleteResp = page.waitForResponse((r) =>
      r.url().includes("/delete/coach_note")
    );
    await newItem.getByRole("button").click();

    expect((await deleteResp).status()).toBe(200);
    await expect(newItem).toHaveCount(0, { timeout: 5000 });
  });
});
