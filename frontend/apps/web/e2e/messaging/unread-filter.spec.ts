/**
 * PAD-648 — messaging.conversations rule 17: "Todas" / "Não lidas" above the conversation list.
 *
 * "Não lidas" is the server's list (`?unread=1`): every row it shows carries the pill, a read
 * conversation is absent, and "Todas" brings it back. On web the list and the thread sit side by
 * side, so the conversation opened from "Não lidas" stays listed while its pane is open, even
 * after it is read and the list refetches.
 *
 * Rows are matched by test id and `data-unread`, never by text (memory: the thread pane shows
 * the same text as the list preview).
 *
 * R-040: the one message this spec sends is deleted in `finally` by the id the send returned.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH, API_ROOT } from "../helpers/api";
import type { Auth } from "../helpers/cleanup";

/** The seeded coach's display name (e2e/scripts/seed.py). */
const COACH_NAME = "E2E Coach";

async function bearer(request: APIRequestContext, username: string, password: string): Promise<Auth> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
}

test("PAD-648: Não lidas lists only unread conversations, Todas brings the rest back, and the open one stays", async ({
  page,
  request,
}) => {
  const student = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const coach = await bearer(request, COACH_USERNAME, COACH_PASSWORD);

  const studentList = await request.get(`${API_APP}/conversations`, { headers: student });
  const withCoach = (await studentList.json()).conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `student has a conversation named "${COACH_NAME}"`).toBeTruthy();
  const unreadId = String(withCoach.id);

  // Every other conversation of the coach is read, so exactly one is unread after the send.
  const coachList = await request.get(`${API_APP}/conversations`, {
    headers: coach,
    params: { limit: 50 },
  });
  const coachIds: string[] = (await coachList.json()).conversations.map((c: { id: number | string }) => String(c.id));
  const readId = coachIds.find((id) => id !== unreadId);
  expect(readId, "the coach has a second conversation to stay read").toBeTruthy();
  for (const id of coachIds) {
    const res = await request.post(`${API_APP}/conversation/${id}/read`, { headers: coach });
    expect(res.ok(), `mark ${id} read: ${res.status()}`).toBeTruthy();
  }

  let messageId: number | undefined;
  let secondId: number | undefined;
  try {
    const sent = await request.post(`${API_APP}/message`, {
      headers: student,
      data: { conversationId: unreadId, text: `PAD-648 unread ${Date.now()}` },
    });
    expect(sent.status(), "the student's message is stored").toBeLessThan(300);
    messageId = (await sent.json()).id;

    await loginAsCoach(page);
    await openMessages(page);
    const unreadRow = page.getByTestId(`conversation-row-${unreadId}`);
    const readRow = page.getByTestId(`conversation-row-${readId}`);
    await expect(unreadRow).toHaveAttribute("data-unread", "true");
    await expect(readRow).toBeVisible();
    await expect(page.getByTestId("conversations-filter-all")).toHaveAttribute("data-state", "on");

    const unreadAnswer = page.waitForResponse(
      (r) => r.url().includes("/app/conversations") && r.url().includes("unread=1"),
      { timeout: 15_000 }
    );
    await page.getByTestId("conversations-filter-unread").click();
    expect((await unreadAnswer).status()).toBe(200);
    await expect(readRow).toHaveCount(0);
    await expect(unreadRow).toBeVisible();
    const rows = page.locator('[data-testid^="conversation-row-"]');
    for (const flag of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-unread")))) {
      expect(flag).toBe("true");
    }

    await page.getByTestId("conversations-filter-all").click();
    await expect(readRow).toBeVisible();

    // Opened from "Não lidas": read on the server, still listed while its pane is open.
    await page.getByTestId("conversations-filter-unread").click();
    await expect(readRow).toHaveCount(0);
    const markedRead = page.waitForResponse(
      (r) => r.url().includes(`/conversation/${unreadId}/read`) && r.request().method() === "POST",
      { timeout: 15_000 }
    );
    await unreadRow.click();
    await markedRead;
    await expect(page.getByTestId("message-scroller")).toBeVisible();

    // A second message arrives in the open thread: the page marks it read and refetches the list
    // (client.query-cache rule 8). That refetched "Não lidas" page no longer holds the open
    // conversation, so only the pin keeps its row on screen.
    const refetched = page.waitForResponse(async (r) => {
      if (!r.url().includes("/app/conversations?") || !r.url().includes("unread=1")) return false;
      const ids = ((await r.json()).conversations ?? []).map((c: { id: number | string }) => String(c.id));
      return !ids.includes(unreadId);
    }, { timeout: 20_000 });
    const second = await request.post(`${API_APP}/message`, {
      headers: student,
      data: { conversationId: unreadId, text: `PAD-648 while open ${Date.now()}` },
    });
    expect(second.status()).toBeLessThan(300);
    secondId = (await second.json()).id;
    await refetched;
    await expect(unreadRow).toBeVisible();
    await expect(unreadRow).toHaveAttribute("data-unread", "false");
  } finally {
    for (const id of [messageId, secondId]) {
      if (!id) continue;
      const del = await request.delete(`${API_ROOT}/app/notify/debug/rows/message/${id}`, { headers: coach });
      expect.soft(del.ok(), `delete message ${id}: ${del.status()}`).toBeTruthy();
    }
  }
});
