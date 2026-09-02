import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

// PAD-98: the chat conversation list (left panel) must show the DAY, not only
// the time. Seed creates a second conversation (coach <-> "E2E Student Two")
// whose last message is dated yesterday, so its list row must render a
// "Yesterday" day label instead of a bare time like "12:00".
// The e2e-coach UI renders in English, so the label is "Yesterday".

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);
});

test("US-98: conversation list shows a day label for older conversations", async ({ page }) => {
  // Wait for the conversation list to load.
  await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 5000 });

  // The yesterday-dated conversation row.
  const yesterdayRow = page.locator("button", { hasText: "E2E Student Two" });
  await expect(yesterdayRow).toBeVisible({ timeout: 5000 });

  // Its timestamp must be the day label, not just a time.
  await expect(yesterdayRow.getByText(/^Yesterday$/)).toBeVisible();
});
