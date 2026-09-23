/**
 * PAD-408 — messaging.push-notifications rule 12.
 *
 * A push names the message it announces (`?message=<id>` on web), and opening
 * the thread that way must land on THAT message, not the newest one: older
 * pages load until it is present, it is scrolled to centre and highlighted for
 * 900ms like a quoted reply, and the target is dropped from the URL once
 * consumed. A target that cannot be found (deleted, or beyond the walk-back
 * bound) falls back to the newest message with no error.
 *
 * 45 messages are posted through the API rather than typed, into the seeded
 * coach<->student conversation, so the target (the 3rd of the 45) sits well
 * behind the first page of 30 and an older page must load to reach it — the
 * whole point of the spec.
 *
 * Never assert rendered copy here: the UI language depends on the account
 * (see e2e/helpers/auth.ts / CLAUDE.md), so every assertion below is against
 * `data-msg-id` / `data-highlighted` or the URL, never visible text.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, STUDENT_USERNAME, STUDENT_PASSWORD } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const COACH_NAME = "E2E Coach";

/** More than the 30-message first page, so a target near the start of the
 * batch is guaranteed to sit behind at least one older page. */
const SEED_COUNT = 45;

/** 1-based position, among the 45 seeded messages, used as the deep-link
 * target. Old enough (behind the seed's 2 pre-existing messages too) that it
 * cannot be on the first page. */
const TARGET_POSITION = 3;

const SEED_TAG = `pad408-deep-link-${Date.now()}`;

async function apiToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  expect(res.status()).toBe(200);
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** The seeded coach<->student conversation, found by participant name rather
 * than assumed id — the same convention message-by-username.spec.ts and
 * push-denied-feed.spec.ts use. */
async function seededConversationId(
  request: APIRequestContext,
  token: string
): Promise<string> {
  const res = await request.get(`${API_APP}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  const { conversations } = await res.json();
  const withCoach = conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `the student must have a seeded conversation with "${COACH_NAME}"`).toBeTruthy();
  return String(withCoach.id);
}

/** Posts `count` messages from the student, oldest first, and returns their
 * ids in send order. */
async function seedMessages(
  request: APIRequestContext,
  token: string,
  conversationId: string,
  count: number,
  tag: string
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const res = await request.post(`${API_APP}/message`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { conversationId, text: `${tag} ${i}` },
    });
    expect(res.status(), `seeding message ${i}`).toBeLessThan(300);
    const body = await res.json();
    ids.push(String(body.id));
  }
  return ids;
}

async function deleteMessages(
  request: APIRequestContext,
  token: string,
  ids: string[]
): Promise<void> {
  for (const id of ids) {
    await request
      .delete(`${API_APP}/message/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});
  }
}

let conversationId: string;
let seededIds: string[];
let targetId: string;
let newestId: string;
let cleanupToken: string;

test.describe("PAD-408 — a deep link lands on the target message", () => {
  test.beforeAll(async ({ request }) => {
    const token = await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    cleanupToken = token;
    conversationId = await seededConversationId(request, token);
    seededIds = await seedMessages(request, token, conversationId, SEED_COUNT, SEED_TAG);
    targetId = seededIds[TARGET_POSITION - 1];
    newestId = seededIds[seededIds.length - 1];
  });

  test.afterAll(async ({ request }) => {
    // Best-effort: the isolated per-checkout DB is reseeded on the next run
    // regardless, but tidy up within this run since both tests share the
    // conversation.
    await deleteMessages(request, cleanupToken, seededIds);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    page.on("pageerror", (err) => {
      throw err;
    });
  });

  test("a push tap lands on the tapped message, even under newer ones (PAD-408)", async ({
    page,
  }) => {
    await page.goto(`/messages/${conversationId}?message=${targetId}`);

    const target = page.locator(`[data-msg-id="${targetId}"]`);

    // Both must hold concurrently: the target scrolls into view AND carries
    // the highlight, which the same synchronous step sets before the 900ms
    // clear. Polling both at once (rather than sequencing them) avoids
    // racing the highlight's own timeout.
    await Promise.all([
      expect(target).toBeInViewport({ timeout: 20_000 }),
      expect
        .poll(() => target.getAttribute("data-highlighted"), {
          timeout: 20_000,
          intervals: [100],
        })
        .toBe("true"),
    ]);

    // The target is consumed once: the URL drops `?message=` after landing.
    await page.waitForURL((url) => !url.search.includes("message="), { timeout: 5_000 });
    await expect(page).not.toHaveURL(/[?&]message=/);
  });

  test("a target that cannot be found falls back to the newest message (PAD-408)", async ({
    page,
  }) => {
    await page.goto(`/messages/${conversationId}?message=99999999`);

    // Falls back to the ordinary open: newest message visible, no crash (the
    // pageerror listener in beforeEach would fail the test on a throw).
    const newest = page.locator(`[data-msg-id="${newestId}"]`);
    await expect(newest).toBeInViewport({ timeout: 20_000 });
  });
});
