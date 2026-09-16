import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-325 / messaging.conversation-detail rule 15. A reminder whose class was
// deleted keeps its `lessonInstanceId` (no foreign key), and its Yes/No could
// only fail. The server marks such messages `classDeleted` (pinned by
// backend/padel_app/tests/test_pad325_message_class_deleted.py); this spec
// pins what the bubble does with the flag. The real thread is fetched and two
// reminders are appended to it, one for a deleted class and one for a live
// class, so the same page shows both sides.

async function studentToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username: "e2e-student", password: "E2eStudent123!" },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken ?? body.access_token;
}

test("PAD-325: a reminder for a deleted class shows a note instead of its answer buttons", async ({
  page,
  request,
}) => {
  const token = await studentToken(request);
  const convRes = await request.get(`${API_APP}/conversations`, { headers: { Authorization: `Bearer ${token}` } });
  expect(convRes.ok()).toBeTruthy();
  const data = await convRes.json();
  const conversations: { id: string | number }[] = Array.isArray(data) ? data : data.items ?? data.conversations;
  expect(conversations.length, "e2e-student has a seeded conversation").toBeGreaterThan(0);
  const conversationId = String(conversations[0].id);

  const startsAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 19);
  const reminder = (id: number, classDeleted: boolean) => ({
    id,
    senderId: -1,
    content: `PAD-325 reminder ${classDeleted ? "deleted" : "live"}`,
    timestamp: new Date().toISOString(),
    conversationId,
    isRead: true,
    status: "read",
    replyTo: null,
    edited: false,
    isDeleted: false,
    reactions: [],
    messageType: "notification_reminder",
    metadata: { lessonInstanceId: 990000 + id, startsAt },
    classDeleted,
  });

  await page.route(new RegExp(`/api/app/conversation/${conversationId}(\\?|$)`), async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.messages = [...(body.messages ?? []), reminder(990001, false), reminder(990002, true)];
    await route.fulfill({ response, json: body });
  });

  await loginAsStudent(page);
  await page.goto(`/messages/${conversationId}`);

  const live = page.getByText("PAD-325 reminder live").locator("xpath=ancestor::*[.//*[@data-testid='message-reminder-yes']][1]");
  const deleted = page.getByText("PAD-325 reminder deleted").locator(
    "xpath=ancestor::*[.//*[@data-testid='message-class-deleted']][1]"
  );

  await expect(deleted.getByTestId("message-class-deleted")).toBeVisible({ timeout: 15_000 });
  await expect(deleted.getByTestId("message-reminder-yes")).toHaveCount(0);
  await expect(live.getByTestId("message-reminder-yes")).toBeVisible();
  await expect(live.getByTestId("message-class-deleted")).toHaveCount(0);
});
