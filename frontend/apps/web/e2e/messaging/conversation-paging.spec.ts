/**
 * PAD-208 / B-027 — messaging.conversation-detail rules 1, 9, 10 and 11.
 *
 * The thread used to fetch and render every message ever sent, and any content
 * change could move the viewport. These three specs pin the replacement: the
 * open loads one page, scrolling to the top loads the page before it without
 * moving the text under the reader, and a message arriving while the reader is
 * scrolled up does not move the viewport at all.
 *
 * The 60 messages are posted through the API rather than typed: the point of
 * the spec is what happens with a thread longer than a page, and 60 sends
 * through the composer would be a five-minute test of the composer.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  loginAsCoachNoLevels,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * What the clients ask for — `@levelup/hooks`. PAD-224 rule 9 made the OPEN
 * smaller than a walk-back page: the first page's row count is how long the
 * native list stays unanchored and therefore hidden.
 */
const FIRST_PAGE_SIZE = 30;

/**
 * The thread under test is the student's conversation with `e2e-coach-nolevels`,
 * NOT the seeded coach↔student one. These specs post 60 messages each, and the
 * seeded conversation is where every other messaging spec looks for
 * "Welcome to the academy!" and "Thanks coach!" — burying those under a page of
 * filler breaks them. A student may message any active coach, so this
 * conversation is created on demand and belongs to this file alone.
 */
const COUNTERPART_USERNAME = "e2e-coach-nolevels";

async function token(
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
 * The student's conversation with the no-levels coach, created if it does not
 * exist yet. `POST /app/conversation` finds rather than recreates
 * (messaging.conversations), so the three specs in this file share one thread.
 */
async function dedicatedConversationId(
  request: APIRequestContext,
  studentToken: string
): Promise<string> {
  const auth = { Authorization: `Bearer ${studentToken}` };

  const usersRes = await request.get(`${API_APP}/messageable-users`, { headers: auth });
  const users = await usersRes.json();
  const counterpart = users.find(
    (u: { username?: string }) => u.username === COUNTERPART_USERNAME
  );
  expect(counterpart, `the seed must provide ${COUNTERPART_USERNAME}`).toBeTruthy();

  const created = await request.post(`${API_APP}/conversation`, {
    headers: auth,
    data: { otherParticipants: [String(counterpart.id)] },
  });
  expect(created.status()).toBeLessThan(400);
  const conversation = await created.json();
  return String(conversation.id);
}

/** Post `count` messages from the student, oldest first, so the thread outgrows a page. */
async function fillThread(
  request: APIRequestContext,
  studentToken: string,
  conversationId: string,
  count: number,
  tag: string
) {
  for (let i = 1; i <= count; i += 1) {
    const res = await request.post(`${API_APP}/message`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { conversationId, text: `${tag} ${i}` },
    });
    expect(res.status(), `seeding message ${i}`).toBeLessThan(400);
  }
}

/**
 * Open the dedicated conversation as the no-levels coach and wait for its first
 * page. That coach has exactly one conversation — the student's — so the
 * sidebar row is unambiguous.
 */
async function openThread(page: Page) {
  await openMessages(page);
  const detail = page.waitForResponse(
    (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  await page.getByText("E2E Student").first().click();
  await detail;
  await expect(page.locator("[data-msg-id]").last()).toBeVisible({ timeout: 10_000 });
}

/** The scrollable thread container — the only scroller inside the chat pane. */
function scroller(page: Page) {
  return page.locator("[data-testid='message-scroller']");
}

test.describe("PAD-208 — the conversation thread pages instead of loading everything", () => {
  test("US-208a: opening a long thread renders one page, not the whole history", async ({
    page,
    request,
  }) => {
    const studentToken = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const conversationId = await dedicatedConversationId(request, studentToken);
    await fillThread(request, studentToken, conversationId, 60, "pad208-open");

    await loginAsCoachNoLevels(page);
    await openThread(page);

    // 60 messages exist in this thread; at most one page may be rendered, and
    // it must be the newest one. Rule 1.
    const rendered = await page.locator("[data-msg-id]").count();
    expect(rendered).toBe(FIRST_PAGE_SIZE);

    // Rule 9 — the thread opens at the newest message, already positioned.
    const newest = page.locator("[data-msg-id]").last();
    await expect(newest).toBeInViewport();
    await expect(newest).toContainText("pad208-open 60");
  });

  test("US-208b: scrolling to the top loads older messages and keeps the anchor", async ({
    page,
    request,
  }) => {
    const studentToken = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const conversationId = await dedicatedConversationId(request, studentToken);
    await fillThread(request, studentToken, conversationId, 60, "pad208-anchor");

    await loginAsCoachNoLevels(page);
    await openThread(page);

    const before = await page.locator("[data-msg-id]").count();
    expect(before).toBe(FIRST_PAGE_SIZE);

    // The message currently at the top of the loaded page is the anchor: after
    // the prepend it must still be exactly where the reader left it (rule 11).
    const anchor = page.locator("[data-msg-id]").first();
    const anchorId = await anchor.getAttribute("data-msg-id");

    const olderPage = page.waitForResponse(
      (r) => r.url().includes("before=") && r.status() === 200,
      { timeout: 15_000 }
    );
    await scroller(page).evaluate((el) => {
      el.scrollTop = 0;
    });

    // Where the anchor sits in the viewport at the moment the older page is
    // asked for. Rule 11's claim is that this does not change — measuring an
    // absolute position instead would only be measuring the date chip and the
    // container's padding.
    const anchorOffset = (id: string) =>
      page.evaluate((msgId) => {
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        const root = document.querySelector("[data-testid='message-scroller']");
        if (!el || !root) return null;
        return el.getBoundingClientRect().top - root.getBoundingClientRect().top;
      }, id);

    const offsetBefore = await anchorOffset(anchorId!);
    expect(offsetBefore).not.toBeNull();

    await olderPage;

    await expect
      .poll(async () => page.locator("[data-msg-id]").count(), { timeout: 10_000 })
      .toBeGreaterThan(before);

    // Anchored, not jumped: the message the reader was looking at is still in
    // the same place on screen, with a page of older messages now above it.
    const offsetAfter = await anchorOffset(anchorId!);
    expect(offsetAfter, "the anchor message must still be rendered").not.toBeNull();
    expect(Math.abs(offsetAfter! - offsetBefore!)).toBeLessThan(10);

    // And the reader is genuinely no longer at the top — the prepended page is
    // above them, which is what "anchored" means here.
    expect(
      await scroller(page).evaluate((el: HTMLElement) => el.scrollTop)
    ).toBeGreaterThan(0);
  });

  test("US-208c: a message arriving while scrolled up does not move the viewport", async ({
    page,
    request,
  }) => {
    const studentToken = await token(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const conversationId = await dedicatedConversationId(request, studentToken);
    await fillThread(request, studentToken, conversationId, 60, "pad208-stable");

    await loginAsCoachNoLevels(page);
    await openThread(page);

    // Scroll up, away from the bottom, as a reader catching up would.
    await scroller(page).evaluate((el) => {
      el.scrollTop = Math.floor(el.scrollHeight * 0.3);
    });
    await expect
      .poll(async () => scroller(page).evaluate((el: HTMLElement) => el.scrollTop))
      .toBeGreaterThan(100);
    const scrollTopBefore = await scroller(page).evaluate(
      (el: HTMLElement) => el.scrollTop
    );
    // Guard against a vacuous pass: the assertion below is only meaningful if
    // the viewport really is away from the bottom before the message arrives.
    const awayFromBottom = await scroller(page).evaluate(
      (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight
    );
    expect(awayFromBottom).toBeGreaterThan(200);

    // The student sends while the coach is reading older messages. It arrives
    // over SSE and appends to the newest page.
    const arriving = `pad208-stable interrupt ${Date.now()}`;
    await request.post(`${API_APP}/message`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { conversationId, text: arriving },
    });

    // Wait for the arrival to have been applied — the "new messages" affordance
    // is rule 10's replacement for moving the view.
    await expect(
      page.getByRole("button", { name: /scroll to bottom|ir para o fim|new messages|novas mensagens/i })
    ).toBeVisible({ timeout: 15_000 });

    const scrollTopAfter = await scroller(page).evaluate(
      (el: HTMLElement) => el.scrollTop
    );
    expect(Math.abs(scrollTopAfter - scrollTopBefore)).toBeLessThan(5);
  });
});
