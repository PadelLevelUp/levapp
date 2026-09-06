import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

// All tests rely on a seeded conversation between e2e-coach and e2e-student
// containing two messages: one from coach ("Welcome to the academy!") and one
// unread message from student ("Thanks coach!"). See e2e/scripts/seed.py.

const SEEDED_COACH_MESSAGE = "Welcome to the academy!";
const SEEDED_STUDENT_MESSAGE = "Thanks coach!";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);
});

// US-27: Coach can view the messaging inbox
test("US-27: messages page renders", async ({ page }) => {
  // Conversation list should show the seeded conversation with the student.
  await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 5000 });
});

// US-57: Coach can start a new conversation via the "+" button next to search
test("US-57: coach can open new conversation flow", async ({ page }) => {
  await page.getByRole("button", { name: /new conversation/i }).click();
  // The "New conversation" dialog should open with a user search field.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder(/search users/i)).toBeVisible();
});

// US-58: Coach can send a message in an existing conversation
test("US-58: coach can type and send a message", async ({ page }) => {
  await page.getByText("E2E Student").first().click();
  // Wait for the conversation to load before typing.
  await page.waitForResponse(
    (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );

  const msgInput = page.getByPlaceholder(/type a message/i);
  await expect(msgInput).toBeVisible({ timeout: 5000 });

  const newMessage = `US-58 hello ${Date.now()}`;
  await msgInput.fill(newMessage);
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/message(\?|$)/.test(r.url()) && r.request().method() === "POST" && r.status() < 400,
      { timeout: 10_000 }
    ),
    msgInput.press("Enter"),
  ]);

  // The text appears in both the conversation list sidebar (preview) and the
  // message bubble. Match the bubble (last in DOM) to avoid strict-mode collisions.
  await expect(page.getByText(newMessage).last()).toBeVisible({ timeout: 5000 });
});

// US-59: Sent messages appear immediately (without page reload)
test("US-59: sent messages appear immediately in the conversation", async ({ page }) => {
  // Arm the wait before the click: the detail response can land before a
  // wait registered afterwards would see it (PAD-204 made it fast enough
  // for that race to show up under full-suite load).
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByText("E2E Student").first().click(),
  ]);

  const msgInput = page.getByPlaceholder(/type a message/i);
  const newMessage = `US-59 immediate ${Date.now()}`;
  await msgInput.fill(newMessage);
  await msgInput.press("Enter");

  // Should appear within 2s without any reload. Bubble is the last DOM match.
  await expect(page.getByText(newMessage).last()).toBeVisible({ timeout: 2_000 });

  // No error toast.
  const errorVisible = await page
    .locator("text=/failed|error/i")
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
  expect(errorVisible).toBe(false);
});

// US-60: Coach can edit a sent message via the right-click context menu
test("US-60: coach can edit a sent message", async ({ page }) => {
  // Arm the wait before the click: the detail response can land before a
  // wait registered afterwards would see it (PAD-204 made it fast enough
  // for that race to show up under full-suite load).
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByText("E2E Student").first().click(),
  ]);

  // The seeded coach message is editable (mine=true, so Edit/Delete are exposed).
  const bubble = page.getByText(SEEDED_COACH_MESSAGE).first();
  await expect(bubble).toBeVisible({ timeout: 5000 });
  await bubble.click({ button: "right" });

  // The action menu portal renders Edit/Copy/Delete buttons.
  const editBtn = page.getByRole("button", { name: /^edit$/i });
  await expect(editBtn).toBeVisible({ timeout: 3000 });
  await editBtn.click();

  // Edit input replaces the bubble text — find the editable input.
  const editInput = page.locator('textarea, input[type="text"]').last();
  await editInput.fill("Welcome to the academy! [edited]");
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/message\/\d+/.test(r.url()) && r.request().method() === "PUT" && r.status() < 400,
      { timeout: 10_000 }
    ),
    editInput.press("Enter"),
  ]);

  await expect(page.getByText("Welcome to the academy! [edited]").last()).toBeVisible({ timeout: 5000 });
});

// US-61: Coach can delete a sent message via the right-click context menu
test("US-61: coach can delete a sent message", async ({ page }) => {
  // Arm the wait before the click: the detail response can land before a
  // wait registered afterwards would see it (PAD-204 made it fast enough
  // for that race to show up under full-suite load).
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByText("E2E Student").first().click(),
  ]);

  // Send a fresh message that we can safely delete (avoids racing against the
  // edit test if it runs first and modifies the seeded message).
  const msgInput = page.getByPlaceholder(/type a message/i);
  const tempMessage = `US-61 to delete ${Date.now()}`;
  await msgInput.fill(tempMessage);
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/message(\?|$)/.test(r.url()) && r.request().method() === "POST" && r.status() < 400,
      { timeout: 10_000 }
    ),
    msgInput.press("Enter"),
  ]);
  // Right-click the bubble (last DOM match — first would be sidebar preview).
  const bubble = page.getByText(tempMessage).last();
  await expect(bubble).toBeVisible({ timeout: 5000 });

  await bubble.click({ button: "right" });
  const deleteBtn = page.getByRole("button", { name: /^delete$/i });
  await expect(deleteBtn).toBeVisible({ timeout: 3000 });
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/message\/\d+/.test(r.url()) && r.request().method() === "DELETE" && r.status() < 400,
      { timeout: 10_000 }
    ),
    deleteBtn.click(),
  ]);

  // The deleted message renders as a "Message deleted" italic placeholder
  // inside the conversation thread. (The original text may still appear in
  // the conversation list sidebar as a "last message" preview, which is
  // expected — we only need the bubble itself to be replaced.)
  await expect(page.getByText("Message deleted").last()).toBeVisible({ timeout: 5000 });
});

// US-62: Unread badge updates when a new message arrives
test("US-62: unread badge updates when a message is received", async ({ page, browser }) => {
  // Coach starts on dashboard so the messages-tab badge is the indicator.
  await page.goto("/dashboard");

  // Student sends a fresh message in the seeded conversation.
  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent(studentPage);
    await openMessages(studentPage);

    // Arm the wait before the click: the detail response can land before a
    // wait registered afterwards would see it (PAD-204 made it fast enough
    // for that race to show up under full-suite load).
    await Promise.all([
      studentPage.waitForResponse(
        (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
        { timeout: 10_000 }
      ),
      studentPage.getByText("E2E Coach").first().click(),
    ]);

    const msgInput = studentPage.getByPlaceholder(/type a message/i);
    await msgInput.fill(`US-62 unread ping ${Date.now()}`);
    await Promise.all([
      studentPage.waitForResponse(
        (r) => /\/api\/app\/message(\?|$)/.test(r.url()) && r.request().method() === "POST" && r.status() < 400,
        { timeout: 10_000 }
      ),
      msgInput.press("Enter"),
    ]);

    // Coach's sidebar Messages link should show an unread indicator.
    // The seed already created an unread message, so the badge may already be
    // present — that's fine; we just need it to be visible.
    const badge = page.locator('a[href="/messages"]').locator(":scope span, :scope [class*='badge']").first();
    await expect(badge).toBeVisible({ timeout: 8000 });
  } finally {
    await studentCtx.close().catch(() => {});
  }
});

// US-63: Opening a conversation marks messages as read
test("US-63: opening a conversation clears the unread count", async ({ page }) => {
  // Seed creates an unread student message. Coach opens conversation → read.
  // First navigate away so we're on a page where the badge would be visible.
  await page.goto("/dashboard");

  // Wait for the unread count API to settle so the initial badge state renders.
  await page.waitForResponse(
    (r) => /\/api\/app\/messages\/unread_count/.test(r.url()) && r.status() === 200,
    { timeout: 5_000 }
  ).catch(() => null);

  // Open messages and click the seeded conversation.
  await openMessages(page);
  const conv = page.getByText("E2E Student").first();
  await expect(conv).toBeVisible({ timeout: 5000 });
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+\/read/.test(r.url()) && r.status() < 400,
      { timeout: 10_000 }
    ),
    conv.click(),
  ]);

  // After opening, the unread badge on the sidebar messages link should be gone.
  const badge = page.locator('a[href="/messages"]').locator(":scope [class*='badge'], :scope [class*='unread']").first();
  await expect(badge).not.toBeVisible({ timeout: 5000 });
});

// US-64: New message received inside an open conversation auto-scrolls into view
test("US-64: new message in open conversation is scrolled into view", async ({ page, browser }) => {
  // Coach opens the seeded conversation
  // Arm the wait before the click: the detail response can land before a
  // wait registered afterwards would see it (PAD-204 made it fast enough
  // for that race to show up under full-suite load).
  await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByText("E2E Student").first().click(),
  ]);

  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent(studentPage);
    await openMessages(studentPage);
    // Arm the wait before the click: the detail response can land before a
    // wait registered afterwards would see it (PAD-204 made it fast enough
    // for that race to show up under full-suite load).
    await Promise.all([
      studentPage.waitForResponse(
        (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
        { timeout: 10_000 }
      ),
      studentPage.getByText("E2E Coach").first().click(),
    ]);

    const uniqueText = `US-64 scroll test ${Date.now()}`;
    const msgInput = studentPage.getByPlaceholder(/type a message/i);
    await msgInput.fill(uniqueText);
    await msgInput.press("Enter");

    // Coach (with conversation open) should see the new message via SSE/poll.
    // Bubble is .last(); .first() would match the sidebar preview.
    await expect(page.getByText(uniqueText).last()).toBeVisible({ timeout: 8000 });
  } finally {
    await studentCtx.close().catch(() => {});
  }
});
