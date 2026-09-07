import { test, expect, type Page } from "@playwright/test";
import {
  loginAsStudent,
  loginAsStudent2,
  loginAsStudent3,
  STUDENT_USERNAME,
  STUDENT3_USERNAME,
} from "../helpers/auth";
import { openMessages, openSettings } from "../helpers/navigation";

/**
 * messaging.block-and-report rules 7–10 (PAD-215): a message from someone the
 * viewer shares no club with arrives flagged with Block and Report; replying
 * clears the flag; "Report and block" files the report and blocks in one go;
 * blocks are manageable under Settings → Account.
 *
 * e2e-student-3 (seed.py) has no coach and no club, so neither side of a
 * conversation with them is a "known contact" until someone replies.
 */

async function openNewConversation(page: Page) {
  await page.getByRole("button", { name: /new conversation|nova conversa/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
}

const composer = (page: Page) => page.getByPlaceholder(/type a message|escreve/i);

/**
 * A student messages e2e-student-3 by username and sends `text`. The sender is
 * parameterised because `isKnownContact` is a property of the conversation: once
 * student-3 has replied to e2e-student (test 2), that thread is "known" for
 * good, so the report-and-block test needs a fresh sender (e2e-student-2).
 */
async function studentMessagesStudent3(
  page: Page,
  text: string,
  sender: "student" | "student2" = "student"
) {
  if (sender === "student2") {
    await loginAsStudent2(page);
  } else {
    await loginAsStudent(page);
  }
  await openMessages(page);
  await openNewConversation(page);
  await page.getByTestId("message-by-username-input").fill(STUDENT3_USERNAME);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/conversation(\?|$)/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    page.getByTestId("message-by-username-submit").click(),
  ]);
  const input = composer(page);
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(text);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/message(\?|$)/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    input.press("Enter"),
  ]);
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 5000 });
}

/** Signs in as e2e-student-3 and opens the thread that contains `text`. */
async function student3OpensThread(page: Page, text: string) {
  await loginAsStudent3(page);
  await openMessages(page);
  await page.getByText(text).first().click();
  await expect(composer(page)).toBeVisible({ timeout: 5000 });
}

test("US-215: a message from someone you share no club with shows the unknown-sender banner", async ({
  page,
}) => {
  const text = `US-215 hello ${Date.now()}`;
  await studentMessagesStudent3(page, text);

  await student3OpensThread(page, text);
  const banner = page.getByTestId("unknown-sender-banner");
  await expect(banner).toBeVisible({ timeout: 5000 });
  await expect(banner).toContainText(/E2E Student/);
  await expect(page.getByTestId("unknown-sender-block")).toBeVisible();
  await expect(page.getByTestId("unknown-sender-report")).toBeVisible();
});

test("US-215: replying clears the banner, now and after a reload", async ({ page }) => {
  const text = `US-215 reply ${Date.now()}`;
  await studentMessagesStudent3(page, text);

  await student3OpensThread(page, text);
  await expect(page.getByTestId("unknown-sender-banner")).toBeVisible({ timeout: 5000 });

  const reply = `US-215 thanks ${Date.now()}`;
  await composer(page).fill(reply);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/message(\?|$)/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    composer(page).press("Enter"),
  ]);
  await expect(page.getByTestId("unknown-sender-banner")).toHaveCount(0, { timeout: 5000 });

  // Rule 7: the server agrees once the viewer has written in the thread.
  await page.reload();
  await expect(composer(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("unknown-sender-banner")).toHaveCount(0);
});

test("US-215: Report and block from the banner, then Unblock from Settings → Account", async ({
  page,
}) => {
  const text = `US-215 report ${Date.now()}`;
  await studentMessagesStudent3(page, text, "student2");

  await student3OpensThread(page, text);
  await page.getByTestId("unknown-sender-report").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // The banner presets "unsolicited".
  await expect(dialog.locator("#report-reason-unsolicited")).toHaveAttribute("data-state", "checked");

  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/messages\/\d+\/report/.test(r.url()) && r.status() < 400,
      { timeout: 10_000 }
    ),
    page.waitForResponse(
      (r) =>
        /\/api\/app\/users\/\d+\/block/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    page.getByTestId("report-and-block").click(),
  ]);

  // Blocked state: banner gone, composer replaced by the blocked note.
  await expect(page.getByTestId("unknown-sender-banner")).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByText(/you've blocked this user|bloqueaste este utilizador/i)).toBeVisible({
    timeout: 5000,
  });

  // Settings → Account lists the sender; Unblock restores the composer.
  await openSettings(page);
  await page.getByRole("button", { name: /^(account|conta)$/i }).first().click();
  const list = page.getByTestId("blocked-users");
  await expect(list).toBeVisible({ timeout: 5000 });
  await expect(list).toContainText("E2E Student");
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/users\/\d+\/block/.test(r.url()) &&
        r.request().method() === "DELETE" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    list.getByRole("button", { name: /unblock|desbloquear/i }).first().click(),
  ]);
  await expect(page.getByTestId("blocked-users-empty")).toBeVisible({ timeout: 5000 });

  await openMessages(page);
  await page.getByText(text).first().click();
  await expect(composer(page)).toBeEnabled({ timeout: 5000 });
  // Unblocked but still never replied → the banner is back (rule 7/8).
  await expect(page.getByTestId("unknown-sender-banner")).toBeVisible({ timeout: 5000 });
  void STUDENT_USERNAME;
});
