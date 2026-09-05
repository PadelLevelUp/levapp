/**
 * PAD-149 — The nav unread badge must clear in-session when a conversation is
 * opened, with no page reload.
 *
 * The weekly QA sweep (2026-08-30) measured the badge staying at its stale
 * count for the rest of the session after the conversation was read, while
 * `GET /api/app/messages/unread_count` already returned 0 — a purely
 * client-side staleness bug.
 *
 * Root cause (measured in the browser, not inferred): `AppLayout` mounted a
 * SECOND `LayoutProvider` nested inside the one `App.tsx` already wraps the
 * router in. `MessagesPage` calls `useLayout()` at its own top level and
 * renders `<AppLayout>`, so it wrote the refreshed count to the OUTER provider,
 * while `AppLayoutInner` — which draws the badge — read the INNER one. The
 * network sequence was always correct (POST .../read → 204, then
 * unread_count → {"unreadCount":0}); the value simply had nowhere to land.
 *
 * This is NOT the race PAD-153 (`a1c48d7`) fixed. That fix was real but not the
 * operative cause, which is exactly why PAD-153 asked PAD-149 to verify rather
 * than assume.
 *
 * Spec: messaging.read-tracking rules 6-7 / "Nav unread badge clears when the
 * conversation is opened, without a reload".
 *
 * The test seeds its OWN unread message rather than relying on seed.py's single
 * one: the suite runs serially in one DB, and earlier messaging specs open the
 * seeded conversation, which marks it read. Relying on the fixture made this
 * spec pass alone and fail in a full run — the positive assertion below is what
 * caught that, and it is why it must stay.
 *
 * Run a single test:
 *   npx playwright test e2e/messaging/nav-unread-badge.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const CONVERSATION_PARTNER = "E2E Student";

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

/** Send a message from the student to the coach, creating a fresh unread. */
async function seedUnreadForCoach(request: APIRequestContext): Promise<void> {
  const token = await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const convosRes = await request.get(`${API_APP}/conversations`, { headers });
  expect(convosRes.status(), "student must be able to list conversations").toBe(200);
  const { conversations } = await convosRes.json();

  const withCoach = conversations.find((c: { name?: string; title?: string }) =>
    `${c.name ?? ""}${c.title ?? ""}`.toLowerCase().includes("coach")
  );
  const conversationId = String((withCoach ?? conversations[0]).id);

  const sent = await request.post(`${API_APP}/message`, {
    headers,
    data: {
      conversationId,
      text: `PAD-149 unread probe ${Date.now()}`,
    },
  });
  expect(sent.status(), "seeding an unread message must succeed").toBeLessThan(300);
}

test("PAD-149: opening the conversation clears the nav unread badge without a reload", async ({
  page,
  request,
}) => {
  expect(COACH_USERNAME).toBe("e2e-coach");
  await seedUnreadForCoach(request);

  await loginAsCoach(page);
  await openMessages(page);

  const badge = page.getByTestId("nav-unread-badge");

  // Positive first — without it, a green run is indistinguishable from
  // "there was never an unread message to clear".
  await expect(badge, "the seeded unread must render a badge").toBeVisible({
    timeout: 10_000,
  });

  // Mark this document so a reload is detectable.
  await page.evaluate(() => {
    (window as unknown as { __pad149: true }).__pad149 = true;
  });

  await page.getByText(CONVERSATION_PARTNER).first().click();
  await page.waitForResponse(
    (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );

  await expect(badge, "the nav badge must clear in-session").toBeHidden({
    timeout: 10_000,
  });

  expect(
    await page.evaluate(
      () => (window as unknown as { __pad149?: true }).__pad149 === true
    ),
    "the badge must clear without the page reloading"
  ).toBe(true);

  // And it stays gone once the thread has settled.
  await expect(badge).toBeHidden();
});
