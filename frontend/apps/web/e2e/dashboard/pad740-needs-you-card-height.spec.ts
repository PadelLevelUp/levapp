/**
 * PAD-740 (B-682, dashboard.blocks rule 3): on desktop the needs-you queue is a two-column
 * grid, and a reply card next to an empty-seats card used to stretch to the class card's
 * height (CSS grid's default `align-items: stretch`). Every card now keeps its own height.
 *
 * Seed: under-capacity classes this week on every weekday but Saturday (see
 * pad424-425-dashboard-actions.spec.ts). The reply is this spec's own: needs-you-deep-links
 * opens the seeded unread message, which reads it. R-040: the one message this spec sends is
 * deleted in `finally` by the id the send returned.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD, STUDENT_USERNAME, STUDENT_PASSWORD } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";
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

test("PAD-740: a reply card stays as tall as its content beside an empty-seats card", async ({ page, request }) => {
  const student = await bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const coach = await bearer(request, COACH_USERNAME, COACH_PASSWORD);
  const convos = await request.get(`${API_APP}/conversations`, { headers: student });
  expect(convos.status()).toBe(200);
  const withCoach = (await convos.json()).conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `student has a conversation named "${COACH_NAME}"`).toBeTruthy();

  let messageId: number | undefined;
  try {
    const sent = await request.post(`${API_APP}/message`, {
      headers: student,
      data: { conversationId: String(withCoach.id), text: `PAD-740 reply ${Date.now()}` },
    });
    expect(sent.status(), "the student's message is stored").toBeLessThan(300);
    messageId = (await sent.json()).id;

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsCoach(page);
    await openDashboard(page);

    const queue = page.getByTestId("dashboard-needs-you");
    const reply = queue.getByTestId("dashboard-queue-reply").first();
    await expect(reply).toBeVisible({ timeout: 15_000 });
    const seats = queue.locator('[data-testid^="needs-you-empty-seats-"]');
    test.skip((await seats.count()) === 0, "no under-capacity class left this week (Saturday): rule 3, PAD-740");

    // The card's own height is its tallest child plus its vertical padding and borders. A
    // stretched card is taller than that by the empty space.
    const { height, content } = await reply.evaluate((card) => {
      const style = getComputedStyle(card);
      const chrome = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth]
        .reduce((sum, value) => sum + parseFloat(value), 0);
      const tallest = Math.max(...Array.from(card.children).map((c) => c.getBoundingClientRect().height));
      return { height: card.getBoundingClientRect().height, content: tallest + chrome };
    });
    expect(height).toBeLessThanOrEqual(content + 1);
    // And it is visibly shorter than the class card it may share a row with.
    const seatHeight = (await seats.first().boundingBox())!.height;
    expect(height).toBeLessThan(seatHeight);
  } finally {
    if (messageId !== undefined) {
      const del = await request.delete(`${API_ROOT}/app/notify/debug/rows/message/${messageId}`, { headers: coach });
      expect.soft(del.ok(), `delete message ${messageId}: ${del.status()}`).toBeTruthy();
    }
  }
});
