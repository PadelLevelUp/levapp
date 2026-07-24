import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsCoachNoLevels } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-78: the coach dashboard "Revenue" card is replaced by a "pending
 * confirmations" card — how many students invited/notified for tomorrow's
 * classes have neither confirmed nor declined — plus an always-visible
 * "send manual notification" button that is disabled when there is nobody to
 * notify and, when clicked, asks for confirmation before firing an extra
 * reminder to only the pending students.
 *
 * Seed (e2e/scripts/seed.py): the "E2E Pending Confirm Class" is TOMORROW with
 * 2 students still pending (sent), 1 confirmed and 1 declined -> count = 2.
 * The no-levels coach has no classes -> count = 0 (button disabled).
 */

async function waitForDashboard(page: import("@playwright/test").Page) {
  const payload = page.waitForResponse(
    (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  await openDashboard(page);
  return payload;
}

test("PAD-78: coach dashboard replaces Revenue with a pending-confirmations card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsCoach(page);
  await waitForDashboard(page);

  // The old Revenue card is gone.
  await expect(page.getByText(/revenue/i)).toHaveCount(0);

  // The pending-confirmations card shows the correct count (2 pending tomorrow).
  const card = page.getByTestId("dashboard-pending-confirmations");
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("dashboard-pending-count")).toHaveText("2");

  // The manual-notify button is visible and enabled (there are pending students).
  const notifyBtn = page.getByTestId("dashboard-notify-button");
  await expect(notifyBtn).toBeVisible();
  await expect(notifyBtn).toBeEnabled();
});

test("PAD-78: manual notify asks for confirmation and notifies only pending students", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsCoach(page);
  await waitForDashboard(page);

  await page.getByTestId("dashboard-notify-button").click();

  // Confirmation dialog is shown.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText(/are you sure|tem a certeza/i)).toBeVisible();

  // Confirm -> a notify request fires and succeeds, reaching only the pending set.
  const notifyResponse = page.waitForResponse(
    (r) =>
      /\/api\/app\/dashboard\/pending-confirmations\/notify/.test(r.url()) &&
      r.request().method() === "POST",
    { timeout: 10_000 }
  );
  await dialog.getByRole("button", { name: /^(send|enviar)$/i }).click();

  const res = await notifyResponse;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sent).toBe(2);
});

test("PAD-78: notify button is visible but disabled when nobody is pending", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsCoachNoLevels(page);
  await waitForDashboard(page);

  const card = page.getByTestId("dashboard-pending-confirmations");
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("dashboard-pending-count")).toHaveText("0");

  const notifyBtn = page.getByTestId("dashboard-notify-button");
  await expect(notifyBtn).toBeVisible();
  await expect(notifyBtn).toBeDisabled();
});
