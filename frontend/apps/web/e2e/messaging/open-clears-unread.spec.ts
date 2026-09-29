/**
 * PAD-416 — opening a conversation clears every count that shows it
 * (messaging.read-tracking, "Opening a conversation clears every count that
 * shows it").
 *
 * The nav badge alone is pinned by nav-unread-badge.spec.ts (PAD-149), and the
 * row pill only after an API mark-read plus a reload (conversation-first-unread,
 * US-414). This spec opens the thread in the UI and checks all three counts in
 * the same document: the row's pill, the nav badge, and the installed-PWA icon
 * badge (`navigator.setAppBadge` / `clearAppBadge`, LayoutContext), which no
 * test observed before. The Badging API is recorded by an init script, since
 * headless Chromium is not an installed PWA.
 *
 * R-040: the one message this spec sends is deleted in `finally` through the
 * superadmin editor, by the id the send returned.
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

type BadgeCall = { fn: "set" | "clear"; count?: number };

async function bearer(request: APIRequestContext, username: string, password: string): Promise<Auth> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.ok(), `login ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${json.accessToken ?? json.access_token}` };
}

test("PAD-416: opening an unread conversation clears its row, the nav badge and the app badge, without a reload", async ({
  page,
  request,
}) => {
  const student = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const coach = await bearer(request, COACH_USERNAME, COACH_PASSWORD);

  const convos = await request.get(`${API_APP}/conversations`, { headers: student });
  expect(convos.status()).toBe(200);
  const withCoach = (await convos.json()).conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `student has a conversation named "${COACH_NAME}"`).toBeTruthy();
  const conversationId = String(withCoach.id);

  let messageId: number | undefined;
  try {
    // Start from a read thread so this conversation contributes exactly the one
    // message sent below, whatever earlier specs left.
    const read = await request.post(`${API_APP}/conversation/${conversationId}/read`, { headers: coach });
    expect(read.ok(), `coach marks the thread read: ${read.status()}`).toBeTruthy();
    const sent = await request.post(`${API_APP}/message`, {
      headers: student,
      data: { conversationId, text: `PAD-416 unread ${Date.now()}` },
    });
    expect(sent.status(), "the student's message is stored").toBeLessThan(300);
    messageId = (await sent.json()).id;
    expect(messageId, "the send returns the new message's id").toBeGreaterThan(0);

    // The expected total comes from the server, not from the badge's text (which caps at 99+).
    const count = await request.get(`${API_APP}/messages/unread_count`, { headers: coach });
    expect(count.status()).toBe(200);
    const totalBefore = Number((await count.json()).unreadCount);
    expect(totalBefore, "this conversation's message is counted").toBeGreaterThanOrEqual(1);
    expect(totalBefore, "the badge shows the number itself below 100").toBeLessThan(100);

    await page.addInitScript(() => {
      const calls: Array<{ fn: "set" | "clear"; count?: number }> = [];
      (window as unknown as { __badgeCalls: typeof calls }).__badgeCalls = calls;
      Object.assign(navigator, {
        setAppBadge: (count?: number) => {
          calls.push({ fn: "set", count });
          return Promise.resolve();
        },
        clearAppBadge: () => {
          calls.push({ fn: "clear" });
          return Promise.resolve();
        },
      });
    });
    const lastBadge = () =>
      page.evaluate(() => {
        const calls = (window as unknown as { __badgeCalls: BadgeCall[] }).__badgeCalls;
        return calls[calls.length - 1] ?? null;
      });

    await loginAsCoach(page);
    await openMessages(page);

    // Positive first: all three show the unread before the open.
    const row = page.getByTestId(`conversation-row-${conversationId}`);
    await expect(row).toHaveAttribute("data-unread", "true", { timeout: 20_000 });
    await expect(row.getByTestId("unread-pill")).toHaveText("1");
    const nav = page.getByTestId("nav-unread-badge");
    await expect(nav).toHaveText(String(totalBefore), { timeout: 10_000 });
    await expect.poll(lastBadge).toEqual({ fn: "set", count: totalBefore });

    await page.evaluate(() => {
      (window as unknown as { __pad416: true }).__pad416 = true;
    });
    await row.click();

    const totalAfter = totalBefore - 1;
    await expect(row).toHaveAttribute("data-unread", "false", { timeout: 10_000 });
    await expect(row.getByTestId("unread-pill")).toHaveCount(0);
    if (totalAfter === 0) {
      await expect(nav).toBeHidden({ timeout: 10_000 });
      await expect.poll(lastBadge).toEqual({ fn: "clear" });
    } else {
      await expect(nav).toHaveText(String(totalAfter), { timeout: 10_000 });
      await expect.poll(lastBadge).toEqual({ fn: "set", count: totalAfter });
    }
    expect(
      await page.evaluate(() => (window as unknown as { __pad416?: true }).__pad416 === true),
      "the counts cleared without a reload"
    ).toBe(true);
  } finally {
    if (messageId !== undefined) {
      const del = await request.delete(`${API_ROOT}/editor/message/${messageId}`, { headers: coach });
      expect.soft(del.ok(), `delete message ${messageId}: ${del.status()}`).toBeTruthy();
    }
  }
});
