import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// PAD-45: Coach-facing control to set the cancellation deadline (hours before
// class start, default 24). The value round-trips through the existing
// notification-config API (GET|POST /app/notify/config) under
// restrictions.cancellationDeadlineHours.

async function openNotificationsTab(page: import("@playwright/test").Page) {
  await loginAsCoach(page);
  await openSettings(page);
  // Custom <button> nav — not role="tab"
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({ timeout: 5000 });
}

function autoNotifySwitch(page: import("@playwright/test").Page) {
  return page
    .getByText(/^automatic notifications$/i)
    .locator("xpath=ancestor::div[contains(@class, 'flex')][1]")
    .locator('[role="switch"]')
    .first();
}

async function enableAutoNotify(page: import("@playwright/test").Page) {
  const toggle = autoNotifySwitch(page);
  const state = await toggle.getAttribute("data-state");
  if (state === "unchecked") {
    await toggle.click();
    await expect(
      page.getByRole("button", { name: /^reminders$/i }).first()
    ).toBeEnabled({ timeout: 5000 });
  }
}

async function openRestrictions(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("button", { name: /^restrictions$/i }).first();
  if (await trigger.isDisabled().catch(() => false)) {
    await enableAutoNotify(page);
  }
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 2000 });
  await page.waitForTimeout(300);
}

/** The cancellation-deadline row, located by its label heading. */
function cancellationRow(page: import("@playwright/test").Page) {
  return page
    .getByText(/^cancellation deadline$/i)
    .locator("xpath=ancestor::div[contains(@class, 'space-y-1')][1]");
}

// US-75: Cancellation deadline control defaults to 24 hours.
test("US-75: cancellation deadline control defaults to 24", async ({ page }) => {
  await openNotificationsTab(page);
  await openRestrictions(page);

  const row = cancellationRow(page);
  await expect(row).toBeVisible({ timeout: 5000 });
  // Default value is 24 (hours before class start)
  await expect(row.getByText("24", { exact: true })).toBeVisible({ timeout: 5000 });
});

// US-75: Changing and saving the cancellation deadline persists across reload.
test("US-75: cancellation deadline persists via config API across reload", async ({ page }) => {
  await openNotificationsTab(page);
  await openRestrictions(page);

  const row = cancellationRow(page);
  await expect(row).toBeVisible({ timeout: 5000 });
  await expect(row.getByText("24", { exact: true })).toBeVisible({ timeout: 5000 });

  // The "+" stepper button increments by 1 hour. Click twice → 26.
  const incrementBtn = row.getByRole("button").last();
  await incrementBtn.click();
  await incrementBtn.click();
  await expect(row.getByText("26", { exact: true })).toBeVisible({ timeout: 5000 });

  // Give the auto-save POST time to complete, then reload and re-open.
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({ timeout: 5000 });
  await openRestrictions(page);

  const rowAfter = cancellationRow(page);
  await expect(rowAfter).toBeVisible({ timeout: 5000 });
  await expect(rowAfter.getByText("26", { exact: true })).toBeVisible({ timeout: 5000 });
});
