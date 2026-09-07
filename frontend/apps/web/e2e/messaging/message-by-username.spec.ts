import { test, expect } from "@playwright/test";
import {
  COACH_NOLEVELS_USERNAME,
  loginAsCoach,
  loginAsStudent,
  loginAsStudent2,
  STUDENT2_USERNAME,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

/**
 * messaging.direct-by-username (PAD-214): a student opens a conversation with
 * another student by typing that student's exact username. Students are never
 * listed or searchable; a coach's "New conversation" dialog has no such field.
 * Seeded students e2e-student and e2e-student-2 have no conversation between
 * them on a fresh database (seed.py only pairs each with the coach).
 */

function usernameForm(page: import("@playwright/test").Page) {
  return page.getByTestId("message-by-username");
}

async function openNewConversation(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /new conversation|nova conversa/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
}

test("US-214: a student starts a conversation by exact username and sends a message", async ({
  page,
}) => {
  await loginAsStudent(page);
  await openMessages(page);
  await openNewConversation(page);

  await expect(usernameForm(page)).toBeVisible();
  await page.getByTestId("message-by-username-input").fill(STUDENT2_USERNAME);
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

  // The conversation opened: the composer is there and the header names B.
  const msgInput = page.getByPlaceholder(/type a message|escreve/i);
  await expect(msgInput).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("E2E Student Two").first()).toBeVisible();

  const text = `US-214 hello ${Date.now()}`;
  await msgInput.fill(text);
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/app\/message(\?|$)/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
      { timeout: 10_000 }
    ),
    msgInput.press("Enter"),
  ]);
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 5000 });

  // B sees it in their list.
  await loginAsStudent2(page);
  await openMessages(page);
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
});

test("US-214: an unknown username is reported inline and nothing opens", async ({
  page,
}) => {
  await loginAsStudent(page);
  await openMessages(page);
  await openNewConversation(page);

  await page.getByTestId("message-by-username-input").fill("no-such-user-214");
  await page.getByTestId("message-by-username-submit").click();

  await expect(page.getByTestId("message-by-username-error")).toHaveText(
    /no user with that username|não existe nenhum utilizador/i,
    { timeout: 5000 }
  );
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("US-225: a coach also has the username field and reaches a student by username", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openMessages(page);
  await openNewConversation(page);

  // The connected-people search sits above the list; the username section below it.
  await expect(page.getByPlaceholder(/connected with|ligado/i)).toBeVisible();
  await expect(usernameForm(page)).toBeVisible();

  await page.getByTestId("message-by-username-input").fill(STUDENT2_USERNAME);
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
  await expect(page.getByPlaceholder(/type a message|escreve/i)).toBeVisible({ timeout: 5000 });
});

test("US-225: a student reaches a coach by exact username", async ({ page }) => {
  await loginAsStudent(page);
  await openMessages(page);
  await openNewConversation(page);
  await page.getByTestId("message-by-username-input").fill(COACH_NOLEVELS_USERNAME);
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
  await expect(page.getByPlaceholder(/type a message|escreve/i)).toBeVisible({ timeout: 5000 });
});
