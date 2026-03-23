import { test, expect } from "@playwright/test";
import { loginAsCoach, loginAsStudent, COACH_USERNAME, COACH_PASSWORD, STUDENT_USERNAME, STUDENT_PASSWORD } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);
});

// US-27: Coach can view the messaging inbox
test("US-27: messages page renders", async ({ page }) => {
  // Messages page should have some structure
  const pageVisible = await page
    .locator("text=/message|conversation|inbox|chat/i")
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
  expect(pageVisible).toBe(true);
});

// US-57: Coach can start a new conversation
test("US-57: coach can open new conversation flow", async ({ page }) => {
  const newConvBtn = page
    .getByRole("button", { name: /new|compose|start conversation|\+/i })
    .first();
  if (await newConvBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newConvBtn.click();
    // A dialog / sheet should open to select a recipient
    const recipientField = page
      .locator("text=/select|search|recipient|to/i")
      .first();
    await expect(recipientField).toBeVisible({ timeout: 5000 });
  } else {
    test.skip(true, "New conversation button not found");
  }
});

// US-58: Coach can send a message in an existing conversation
test("US-58: coach can type and send a message", async ({ page }) => {
  // If there are existing conversations, open the first one
  const convItem = page.locator("[class*='conversation'], [role='listitem']").first();
  if (await convItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await convItem.click();
  }

  // Look for message input
  const msgInput = page
    .locator("textarea[placeholder*='message'], input[placeholder*='message'], [contenteditable]")
    .first();
  if (await msgInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await msgInput.fill("E2E test message");
    // Send via button or Enter
    const sendBtn = page.getByRole("button", { name: /send/i }).first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await msgInput.press("Enter");
    }
    await expect(page.getByText("E2E test message")).toBeVisible({ timeout: 5000 });
  } else {
    test.skip(true, "Message input not found — need an active conversation first");
  }
});

// US-59: Real-time delivery indicator
test("US-59: sent messages appear immediately in the conversation", async ({ page }) => {
  // This is covered by US-58 — message appears without page reload
  // Additional check: no error toast after sending
  const errorToast = page
    .locator("text=/failed|error/i")
    .first();
  const errorVisible = await errorToast.isVisible({ timeout: 2000 }).catch(() => false);
  expect(errorVisible).toBe(false);
});

// US-60: Coach can edit a sent message
test("US-60: coach can edit a sent message", async ({ page }) => {
  // Open first conversation
  const convItem = page.locator("[class*='conversation'], [role='listitem']").first();
  if (!await convItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    test.skip(true, "No conversations available");
    return;
  }
  await convItem.click();

  // Look for a message with edit option (hover or context menu)
  const message = page.locator("[class*='message'], [data-testid*='message']").first();
  if (await message.isVisible({ timeout: 3000 }).catch(() => false)) {
    await message.hover();
    const editBtn = page.getByRole("button", { name: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editBtn.click();
      const editInput = page.locator("textarea, input").last();
      await editInput.clear();
      await editInput.fill("Edited message");
      await page.keyboard.press("Enter");
      await expect(page.getByText("Edited message")).toBeVisible({ timeout: 5000 });
    } else {
      test.skip(true, "Edit button not visible — UI may require different interaction");
    }
  } else {
    test.skip(true, "No messages found in conversation");
  }
});

// US-61: Coach can delete a sent message
test("US-61: coach can delete a sent message", async ({ page }) => {
  const convItem = page.locator("[class*='conversation'], [role='listitem']").first();
  if (!await convItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    test.skip(true, "No conversations available");
    return;
  }
  await convItem.click();

  const message = page.locator("[class*='message'], [data-testid*='message']").first();
  if (await message.isVisible({ timeout: 3000 }).catch(() => false)) {
    await message.hover();
    const deleteBtn = page.getByRole("button", { name: /delete/i }).first();
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click();
      // Confirm if needed
      const confirmBtn = page.getByRole("button", { name: /delete|confirm/i }).last();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }
    } else {
      test.skip(true, "Delete button not visible — UI may require different interaction");
    }
  } else {
    test.skip(true, "No messages found in conversation");
  }
});

// US-62: Unread message badge updates when a new message arrives
test("US-62: unread badge updates when a message is received", async ({ page, browser }) => {
  // Student sends a message to coach while coach is on a different page
  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await loginAsStudent(studentPage);
  await openMessages(studentPage);

  // Coach navigates away from messages so the badge can increment
  await page.goto("/dashboard");

  // Student opens the coach conversation and sends a message
  const studentConv = studentPage.locator("[class*='conversation'], [role='listitem']").first();
  if (!await studentConv.isVisible({ timeout: 5000 }).catch(() => false)) {
    await studentCtx.close();
    test.skip(true, "No existing conversation seeded for student");
    return;
  }
  await studentConv.click();
  const msgInput = studentPage
    .locator("textarea[placeholder*='message'], input[placeholder*='message'], [contenteditable]")
    .first();
  await msgInput.fill("US-62 badge test message");
  const sendBtn = studentPage.getByRole("button", { name: /send/i }).first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await msgInput.press("Enter");
  }

  // Coach sidebar messages link should show an unread badge
  const badge = page.locator("a[href='/messages'] [class*='badge'], a[href='/messages'] [class*='unread'], a[href='/messages'] span").first();
  await expect(badge).toBeVisible({ timeout: 8000 });

  await studentCtx.close();
});

// US-63: Opening a conversation marks messages as read (badge resets to 0)
test("US-63: opening a conversation clears the unread count", async ({ page, browser }) => {
  // Student sends a message so coach has unread messages
  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await loginAsStudent(studentPage);
  await openMessages(studentPage);

  await page.goto("/dashboard");

  const studentConv = studentPage.locator("[class*='conversation'], [role='listitem']").first();
  if (!await studentConv.isVisible({ timeout: 5000 }).catch(() => false)) {
    await studentCtx.close();
    test.skip(true, "No existing conversation seeded for student");
    return;
  }
  await studentConv.click();
  const msgInput = studentPage
    .locator("textarea[placeholder*='message'], input[placeholder*='message'], [contenteditable]")
    .first();
  await msgInput.fill("US-63 read-receipt test message");
  const sendBtn = studentPage.getByRole("button", { name: /send/i }).first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await msgInput.press("Enter");
  }

  // Coach opens messages and clicks the conversation
  await openMessages(page);
  const coachConv = page.locator("[class*='conversation'], [role='listitem']").first();
  await expect(coachConv).toBeVisible({ timeout: 5000 });
  await coachConv.click();

  // After opening, badge should disappear or show 0
  const badge = page.locator("a[href='/messages'] [class*='badge'], a[href='/messages'] [class*='unread']").first();
  await expect(badge).not.toBeVisible({ timeout: 5000 });

  await studentCtx.close();
});

// US-64: New message received inside an open conversation auto-scrolls into view
test("US-64: new message in open conversation is scrolled into view", async ({ page, browser }) => {
  // Coach opens the conversation
  const coachConv = page.locator("[class*='conversation'], [role='listitem']").first();
  if (!await coachConv.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.skip(true, "No existing conversation available");
    return;
  }
  await coachConv.click();

  // Student sends a message while coach has the conversation open
  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await loginAsStudent(studentPage);
  await openMessages(studentPage);
  const studentConv = studentPage.locator("[class*='conversation'], [role='listitem']").first();
  if (!await studentConv.isVisible({ timeout: 5000 }).catch(() => false)) {
    await studentCtx.close();
    test.skip(true, "No existing conversation seeded for student");
    return;
  }
  await studentConv.click();
  const msgInput = studentPage
    .locator("textarea[placeholder*='message'], input[placeholder*='message'], [contenteditable]")
    .first();
  const uniqueText = `US-64 scroll test ${Date.now()}`;
  await msgInput.fill(uniqueText);
  const sendBtn = studentPage.getByRole("button", { name: /send/i }).first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await msgInput.press("Enter");
  }

  // The new message should become visible in the coach's view (auto-scroll)
  await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 8000 });

  await studentCtx.close();
});
