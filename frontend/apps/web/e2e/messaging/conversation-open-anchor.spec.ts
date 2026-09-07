/**
 * PAD-224 / B-028 — messaging.conversation-detail rules 9 and 12.
 *
 * The reported defect is iOS-only: the native list commits rows incrementally,
 * so positioning it while it is on screen means the user watches older messages
 * fly past. Web anchors inside a `useLayoutEffect`, between React writing the
 * DOM and the browser painting, so it has no unanchored frame to show.
 *
 * These specs are the **verification** of that claim rather than a driver for
 * web changes. US-224a instruments the open with a `MutationObserver` and a
 * `requestAnimationFrame` sampler and asserts that no frame in which a message
 * row exists had the thread scrolled anywhere but its maximum — the web
 * counterpart of "nothing is ever seen travelling towards the bottom". If this
 * ever goes red, web has acquired the bug iOS had.
 *
 * US-224b and US-224c pin rule 12's jump-to-bottom control, which on web is the
 * chevron `MessageList` already renders. Rule 12 asks for it whenever the reader
 * is more than about a screen above the bottom; web's threshold is tighter than
 * that (one bubble), which satisfies the rule by a margin — these specs hold
 * that behaviour still, and hold that it is NOT conditional on a new message
 * having arrived, which was the gap the reporter hit on iOS.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  loginAsStudent2,
  STUDENT2_USERNAME,
  STUDENT2_PASSWORD,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * The thread under test is `e2e-student-2`'s conversation with the no-levels
 * coach — deliberately NOT the one `conversation-paging.spec.ts` uses. Both
 * files bury their thread under hundreds of filler messages, and they run in
 * the same serial worker against the same database, so sharing one conversation
 * would mean whichever ran second invalidated the first's assertions about its
 * own newest message.
 */
const COUNTERPART_USERNAME = "e2e-coach-nolevels";
const COUNTERPART_NAME = "E2E Coach No Levels";

/** Long enough that the thread is many screens tall — criterion (a) says 200. */
const SEEDED_MESSAGES = 200;

type Sample = { scrollTop: number; maxScrollTop: number; rows: number };

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
  return String((await created.json()).id);
}

/**
 * Fill the thread through the API. 200 sends is slow enough to be worth doing
 * once per spec rather than per assertion, and far faster than the composer.
 */
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

function scroller(page: Page) {
  return page.locator("[data-testid='message-scroller']");
}

/** The rule-12 control. Its accessible name changes when messages are unseen. */
function jumpToBottom(page: Page) {
  return page.getByRole("button", {
    name: /scroll to bottom|ir para o fim|new messages|novas mensagens/i,
  });
}

/**
 * Install the probe BEFORE the thread is opened.
 *
 * A `MutationObserver` samples the scroller every time the DOM under the app
 * changes, and a `requestAnimationFrame` loop samples it every frame. Between
 * them, any frame in which a message row existed and the thread was not at its
 * maximum offset is recorded. Sampling only after the fact would prove nothing:
 * the whole question is what the intermediate frames looked like.
 */
async function installOpenProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __pad224?: Sample[]; __pad224Stop?: () => void };
    const samples: Sample[] = [];
    w.__pad224 = samples;

    const sample = () => {
      const el = document.querySelector<HTMLElement>("[data-testid='message-scroller']");
      if (!el) return;
      const rows = el.querySelectorAll("[data-msg-id]").length;
      if (rows === 0) return;
      samples.push({
        scrollTop: el.scrollTop,
        maxScrollTop: el.scrollHeight - el.clientHeight,
        rows,
      });
    };

    const observer = new MutationObserver(sample);
    observer.observe(document.body, { childList: true, subtree: true });

    let running = true;
    const frame = () => {
      if (!running) return;
      sample();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    w.__pad224Stop = () => {
      running = false;
      observer.disconnect();
    };
  });
}

async function readProbe(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __pad224?: Sample[]; __pad224Stop?: () => void };
    w.__pad224Stop?.();
    return w.__pad224 ?? [];
  });
}

test.describe("PAD-224 — the thread opens anchored, and can be returned to", () => {
  // Seeded once for the file: 200 posts is the expensive part, and none of the
  // three tests writes to the thread.
  test.beforeAll(async ({ request }) => {
    const studentToken = await token(request, STUDENT2_USERNAME, STUDENT2_PASSWORD);
    const conversationId = await dedicatedConversationId(request, studentToken);
    await fillThread(request, studentToken, conversationId, SEEDED_MESSAGES, "pad224");
  });

  test("US-224a: opening a 200-message thread never paints a frame away from the bottom", async ({ page }) => {
    await loginAsStudent2(page);
    await openMessages(page);

    // Probe armed before the thread exists, so the first frame that has a
    // message row in it is captured.
    await installOpenProbe(page);

    const detail = page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    );
    await page.getByText(COUNTERPART_NAME).first().click();
    await detail;
    await expect(page.locator("[data-msg-id]").last()).toBeVisible({ timeout: 10_000 });
    // Let a few more frames run so a late settle would be caught too.
    await page.waitForTimeout(500);

    const samples = await readProbe(page);

    expect(
      samples.length,
      "the probe must have seen the thread render at all"
    ).toBeGreaterThan(0);

    // A pixel of tolerance: `scrollHeight`/`clientHeight` are rounded integers
    // while `scrollTop` is fractional, so an exactly-anchored scroller can read
    // a hair under its own maximum.
    const travelling = samples.filter((s) => s.scrollTop < s.maxScrollTop - 2);
    expect(
      travelling,
      `no painted frame may show the thread above its bottom; saw ${travelling.length} of ${samples.length}`
    ).toEqual([]);
  });

  test("US-224b: scrolled a long way up, the jump-to-bottom control returns you", async ({ page }) => {
    await loginAsStudent2(page);
    await openMessages(page);
    const detail = page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    );
    await page.getByText(COUNTERPART_NAME).first().click();
    await detail;
    await expect(page.locator("[data-msg-id]").last()).toBeVisible({ timeout: 10_000 });

    // Load a couple of older pages first. The open is 30 messages (rule 9), so
    // an unpaged thread is barely three screens tall and "scroll three screens
    // up" would just be "reach the top", which tests rule 11's load-older
    // rather than rule 12's control. Reaching the top on purpose, twice, makes
    // the thread long enough for the scroll below to be an ordinary one.
    for (let i = 0; i < 2; i += 1) {
      const olderPage = page.waitForResponse(
        (r) => r.url().includes("before=") && r.status() === 200,
        { timeout: 15_000 }
      );
      await scroller(page).evaluate((el: HTMLElement) => {
        el.scrollTop = 0;
      });
      await olderPage;
      await page.waitForTimeout(300);
    }
    await scroller(page).evaluate((el: HTMLElement) => {
      el.scrollTop = el.scrollHeight;
    });

    // About three screens up, with nothing having arrived — rule 12 is not
    // conditional on a new message.
    const distance = await scroller(page).evaluate((el: HTMLElement) => {
      el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight * 3);
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(
      distance,
      "the thread must be tall enough to scroll three screens up"
    ).toBeGreaterThan(0);

    await expect(jumpToBottom(page)).toBeVisible({ timeout: 5000 });

    await jumpToBottom(page).click();

    await expect
      .poll(
        async () =>
          scroller(page).evaluate(
            (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight
          ),
        { timeout: 10_000 }
      )
      .toBeLessThan(100);
  });

  test("US-224c: at the bottom there is no jump-to-bottom control", async ({ page }) => {
    await loginAsStudent2(page);
    await openMessages(page);
    const detail = page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 15_000 }
    );
    await page.getByText(COUNTERPART_NAME).first().click();
    await detail;
    await expect(page.locator("[data-msg-id]").last()).toBeVisible({ timeout: 10_000 });

    // Anchored at the newest message and not scrolled: nothing to jump to.
    await expect(jumpToBottom(page)).toHaveCount(0);
  });
});
