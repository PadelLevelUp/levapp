/**
 * PAD-415 — messaging.conversation-detail rule 9a; PAD-414 — messaging.conversations rule 16.
 *
 * A thread with unread messages opens AT the first unread one, under an "Unread messages"
 * divider, instead of at the newest message. The first unread may sit behind the first page
 * (30), so the open walks back to it like a push target. An explicit `?message=` target wins
 * over it. Once everything is read, a re-open lands on the newest message with no divider.
 * In the list, an unread row is marked (`data-unread`) and its pill caps at "9+".
 *
 * Each test starts from a known read mark: the coach marks the seeded coach<->student
 * conversation read through the API, then the student posts a fresh batch, so the first of
 * that batch is exactly the coach's first unread.
 *
 * Never assert rendered copy: the UI language follows the account. Assertions use
 * `data-msg-id`, `data-testid`, `data-unread` and `data-highlighted`. "9+" is a number
 * label, the same in every language.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const COACH_NAME = "E2E Coach";

/** More than the first page of 30, so the first unread is behind an older page. */
const SEED_COUNT = 40;

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

async function seededConversationId(request: APIRequestContext, token: string): Promise<string> {
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

async function markRead(request: APIRequestContext, token: string, conversationId: string) {
  const res = await request.post(`${API_APP}/conversation/${conversationId}/read`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBeLessThan(300);
}

/** Posts `count` messages from the student, oldest first; returns their ids in send order. */
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
    ids.push(String((await res.json()).id));
  }
  return ids;
}

async function deleteMessages(request: APIRequestContext, token: string, ids: string[]) {
  for (const id of ids) {
    await request
      .delete(`${API_APP}/message/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});
  }
}

let coachToken: string;
let studentToken: string;
let conversationId: string;
const seeded: string[] = [];

/** A fresh unread batch after a clean read mark; returns the batch's ids. */
async function freshUnreadBatch(request: APIRequestContext, count: number, tag: string) {
  await markRead(request, coachToken, conversationId);
  const ids = await seedMessages(request, studentToken, conversationId, count, `${tag}-${Date.now()}`);
  seeded.push(...ids);
  return ids;
}

async function openThread(page: Page, search = "") {
  const detail = page.waitForResponse(
    (r) => new RegExp(`/api/app/conversation/${conversationId}(\\?|$)`).test(r.url()) && r.status() === 200,
    { timeout: 20_000 }
  );
  await page.goto(`/messages/${conversationId}${search}`);
  await detail;
}

test.describe.configure({ mode: "serial" });

test.describe("PAD-415 — a thread opens at its first unread message", () => {
  test.beforeAll(async ({ request }) => {
    coachToken = await apiToken(request, COACH_USERNAME, COACH_PASSWORD);
    studentToken = await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    conversationId = await seededConversationId(request, studentToken);
  });

  test.afterAll(async ({ request }) => {
    await deleteMessages(request, studentToken, seeded);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    page.on("pageerror", (err) => {
      throw err;
    });
  });

  test("US-415a: the open walks back to the first unread, under the divider, and a re-open lands on the newest", async ({
    page,
    request,
  }) => {
    const ids = await freshUnreadBatch(request, SEED_COUNT, "pad415-open");
    const first = page.locator(`[data-msg-id="${ids[0]}"]`);
    const newest = page.locator(`[data-msg-id="${ids[ids.length - 1]}"]`);
    const divider = page.getByTestId("unread-divider");

    await openThread(page);

    await expect(first).toBeInViewport({ timeout: 20_000 });
    await expect(divider).toHaveCount(1);
    // Directly above the first unread: the divider ends where the message begins.
    const d = await divider.boundingBox();
    const m = await first.boundingBox();
    expect(d && m, "divider and first unread are both laid out").toBeTruthy();
    expect(d!.y + d!.height).toBeLessThanOrEqual(m!.y + 1);
    expect(m!.y - (d!.y + d!.height)).toBeLessThan(48);
    await expect(newest).not.toBeInViewport();
    // The first-unread landing anchors without the quoted-reply highlight.
    await expect(first).not.toHaveAttribute("data-highlighted", "true");

    // This visit marked the thread read: re-opening lands on the newest, no divider.
    // Newest-in-view first, so the divider's absence is not read off an unloaded thread.
    await page.goto(`/messages/${conversationId}`);
    await expect(newest).toBeInViewport({ timeout: 30_000 });
    await expect(page.getByTestId("unread-divider")).toHaveCount(0);
  });

  test("US-415b: a push target wins over the first unread", async ({ page, request }) => {
    const ids = await freshUnreadBatch(request, SEED_COUNT, "pad415-push");
    const pushed = ids[ids.length - 3];

    await openThread(page, `?message=${pushed}`);

    const target = page.locator(`[data-msg-id="${pushed}"]`);
    await Promise.all([
      expect(target).toBeInViewport({ timeout: 20_000 }),
      expect
        .poll(() => target.getAttribute("data-highlighted"), { timeout: 20_000, intervals: [100] })
        .toBe("true"),
    ]);
    await expect(page.locator(`[data-msg-id="${ids[0]}"]`)).not.toBeInViewport();
  });

  test("US-414: an unread row is marked and its pill caps at 9+", async ({ page, request }) => {
    await freshUnreadBatch(request, 12, "pad414-row");

    await page.goto("/messages");
    const row = page.getByTestId(`conversation-row-${conversationId}`);
    await expect(row).toHaveAttribute("data-unread", "true", { timeout: 20_000 });
    await expect(row.getByTestId("unread-pill")).toHaveText("9+");

    await markRead(request, coachToken, conversationId);
    await page.reload();
    await expect(row).toHaveAttribute("data-unread", "false", { timeout: 20_000 });
    await expect(row.getByTestId("unread-pill")).toHaveCount(0);
  });
});
