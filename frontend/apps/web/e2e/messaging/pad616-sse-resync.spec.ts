/**
 * PAD-616 (messaging.sse-realtime rule 19): after the live stream drops and comes back, the screen
 * catches up with what was published meanwhile — without navigation or a reload.
 *
 * The browser's EventSource is wrapped (init script) only to KEEP a reference to each stream the
 * app opens; the app's own hub does everything else. The test closes the stream (nothing reaches
 * the page any more), has the student send the coach a message (its `message_created` event is
 * lost), checks the badge has NOT moved (the cache's 60 s stale window would keep it so — the
 * control), then fires the stream's own `error` event: the hub drops it and reconnects on its
 * back-off, the re-open delivers `resync`, the unread count is invalidated and the badge shows 1.
 *
 * Run: npx playwright test e2e/messaging/pad616-sse-resync.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_PASSWORD,
  COACH_USERNAME,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { conversationRow, openMessages } from "../helpers/navigation";

/** The seeded coach's display name (e2e/scripts/seed.py). */
const COACH_NAME = "E2E Coach";

async function apiToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username, password },
  });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/**
 * Read every conversation the coach has unread, so the badge counts only this spec's message.
 * The badge shows the coach's TOTAL unread: any earlier spec that leaves one (automatic-message-note
 * did, B-286 / PAD-514) kept it visible after this spec's conversation was read, and the test
 * failed in a group while passing alone. The app was right; the premise "one unread" was not.
 */
async function clearCoachUnread(request: APIRequestContext): Promise<void> {
  const headers = { Authorization: `Bearer ${await apiToken(request, COACH_USERNAME, COACH_PASSWORD)}` };
  const res = await request.get(`${API_APP}/conversations`, { headers });
  expect(res.status(), "coach must be able to list conversations").toBe(200);
  const { conversations } = await res.json();
  for (const c of conversations as Array<{ id: number | string; unreadCount?: number }>) {
    if ((c.unreadCount ?? 0) > 0) {
      const read = await request.post(`${API_APP}/conversation/${c.id}/read`, { headers });
      expect(read.status(), `marking conversation ${c.id} read`).toBeLessThan(300);
    }
  }
  const count = await request.get(`${API_APP}/messages/unread_count`, { headers });
  expect((await count.json()).unreadCount, "the coach starts with nothing unread").toBe(0);
}

/** Send a message from the student to the coach, creating a fresh unread. */
async function seedUnreadForCoach(request: APIRequestContext, text = `PAD-616 resync probe ${Date.now()}`): Promise<void> {
  const token = await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const convosRes = await request.get(`${API_APP}/conversations`, { headers });
  expect(convosRes.status(), "student must be able to list conversations").toBe(200);
  const { conversations } = await convosRes.json();

  // Exact seed name, not a substring match: the student also has a
  // conversation with "E2E Coach No Levels" once message-by-username.spec.ts
  // has run, and it sorts first as the most recent one. Seeding the unread
  // there badges the wrong coach, and this spec then fails on its positive
  // assertion in a full run while passing alone.
  // `participantName` is the OTHER participant as serialized by
  // backend/padel_app/serializers/conversation.py; the list carries no `name`.
  const withCoach = conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `student must have a conversation named "${COACH_NAME}"`).toBeTruthy();
  const conversationId = String(withCoach.id);

  const sent = await request.post(`${API_APP}/message`, {
    headers,
    data: {
      conversationId,
      text,
    },
  });
  expect(sent.status(), "seeding an unread message must succeed").toBeLessThan(300);
}

type StreamWindow = { __levappStreams: EventSource[] };

async function keepStreams(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const Native = window.EventSource;
    const kept: EventSource[] = [];
    (window as unknown as { __levappStreams: EventSource[] }).__levappStreams = kept;
    class Kept extends Native {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        kept.push(this);
      }
    }
    window.EventSource = Kept as typeof EventSource;
  });
}
const streamOpen = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => (window as unknown as StreamWindow).__levappStreams.some((s) => s.readyState === 1));
const killStreams = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    for (const s of (window as unknown as StreamWindow).__levappStreams) s.close();
  });
const reportFailure = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const streams = (window as unknown as StreamWindow).__levappStreams;
    streams[streams.length - 1].dispatchEvent(new Event("error"));
  });

test("PAD-616: a stream that drops and comes back brings the missed message's badge", async ({ page, request }) => {
  await page.addInitScript(() => {
    const Native = window.EventSource;
    const kept: EventSource[] = [];
    (window as unknown as { __levappStreams: EventSource[] }).__levappStreams = kept;
    class Kept extends Native {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        kept.push(this);
      }
    }
    window.EventSource = Kept as typeof EventSource;
  });

  await clearCoachUnread(request);
  await loginAsCoach(page);
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toHaveCount(0);
  // The app's one stream is open.
  await page.waitForFunction(() =>
    (window as unknown as { __levappStreams: EventSource[] }).__levappStreams.some((s) => s.readyState === 1)
  );

  // The stream dies: nothing reaches the page any more.
  await page.evaluate(() => {
    for (const s of (window as unknown as { __levappStreams: EventSource[] }).__levappStreams) s.close();
  });
  await seedUnreadForCoach(request); // its message_created event is lost

  // Control: with the event lost, nothing else moves the badge inside the stale window.
  await page.waitForTimeout(3_000);
  await expect(badge, "a lost event must not show by itself").toHaveCount(0);

  // The stream reports its failure; the app's hub reconnects on its own back-off.
  await page.evaluate(() => {
    const streams = (window as unknown as { __levappStreams: EventSource[] }).__levappStreams;
    streams[streams.length - 1].dispatchEvent(new Event("error"));
  });

  await expect(badge, "the re-open resyncs the unread count").toHaveText("1", { timeout: 20_000 });
  await clearCoachUnread(request);
});

// PAD-616 fold: the open thread itself shows the message it missed (rule 19's thread step).
test("PAD-616: the open thread shows a message sent while the stream was down", async ({ page, request }) => {
  await keepStreams(page);
  await clearCoachUnread(request);
  await loginAsCoach(page);
  await openMessages(page);
  await conversationRow(page, "E2E Student").click();
  await streamOpen(page);

  await killStreams(page);
  const text = `PAD-616 missed in the thread ${Date.now()}`;
  await seedUnreadForCoach(request, text); // its message_created event is lost
  await page.waitForTimeout(3_000);
  await expect(page.getByText(text), "a lost event must not show by itself").toHaveCount(0);

  await reportFailure(page);
  await expect(page.getByText(text), "the re-open folds the newest page into the thread").toBeVisible({ timeout: 20_000 });
  await clearCoachUnread(request);
});
