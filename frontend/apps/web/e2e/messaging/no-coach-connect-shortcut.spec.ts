import { test, expect } from "@playwright/test";
import { loginAsStudent, loginAsStudent3 } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { ui } from "../helpers/i18n";

/**
 * PAD-568 / B-461 — messaging.conversations rule 7, "A student with no coach sees the
 * connect shortcut".
 *
 * e2e-student-3 has no roster row, no club and no class (seed.py, PAD-215), so the server
 * lists nobody: the picker shows "not connected yet" with a "Connect with a coach" action
 * that opens /connect, and the "Message by username" field stays available below it.
 *
 * e2e-student IS linked (on e2e-coach's roster) and the seed already gives the pair a
 * conversation, so the list is filtered down to nothing for a different reason: that case
 * keeps the "already have conversations" line and never shows the shortcut.
 */

test("PAD-568: a student with no coach is offered the connect shortcut", async ({ page }) => {
  await loginAsStudent3(page);
  await openMessages(page);

  await page.getByRole("button", { name: ui("messages.newConversation") }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

  const empty = page.getByTestId("new-conversation-empty");
  await expect(empty).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("new-conversation-row")).toHaveCount(0);
  await expect(page.getByTestId("message-by-username")).toBeVisible();

  await page.getByTestId("new-conversation-connect").click();
  await page.waitForURL("**/connect", { timeout: 10000 });
});

test("PAD-568: a student already talking to every linked coach sees no shortcut", async ({ page }) => {
  await loginAsStudent(page);
  await openMessages(page);

  await page.getByRole("button", { name: ui("messages.newConversation") }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

  await expect(page.getByTestId("new-conversation-all-taken")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("new-conversation-connect")).toHaveCount(0);
  await expect(page.getByTestId("new-conversation-empty")).toHaveCount(0);
});
