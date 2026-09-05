/**
 * PAD-149 — The nav unread badge must clear in-session when a conversation is
 * opened, with no page reload.
 *
 * The weekly QA sweep (2026-08-30) measured the badge staying at `1` for the
 * rest of the session after the conversation was read, while
 * `GET /api/app/messages/unread_count` already returned 0 — a purely
 * client-side staleness bug.
 *
 * The mechanism was a race: `handleSelectConversation` fired
 * `markConversationRead` and `refreshUnreadCount` concurrently, both
 * fire-and-forget, so the refresh could read back the pre-read count. PAD-153
 * (`a1c48d7`, 2026-09-02 — after the sweep measured this) fixed it by awaiting
 * the mark-read first, and said explicitly that PAD-149 should VERIFY rather
 * than assume that was the whole story. This spec is that verification, and the
 * regression test that keeps it fixed.
 *
 * Spec: messaging.read-tracking rules 6-7 / "Nav unread badge clears when the
 * conversation is opened, without a reload".
 *
 * The positive assertion before the negative one is load-bearing: without it, a
 * green run is indistinguishable from "the seed produced no unread at all".
 *
 * Run a single test:
 *   npx playwright test e2e/messaging/nav-unread-badge.spec.ts
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

// seed.py gives the coach exactly one unread message, from e2e-student.
const CONVERSATION_PARTNER = "E2E Student";

test("PAD-149: opening the conversation clears the nav unread badge without a reload", async ({
  page,
}) => {
  await loginAsCoach(page);
  await openMessages(page);

  const badge = page.getByTestId("nav-unread-badge");

  // Positive first — proves the fixture actually seeded an unread.
  await expect(badge, "the seeded unread must render a badge").toBeVisible({
    timeout: 10_000,
  });
  await expect(badge).toHaveText("1");

  // Record the load so we can prove no reload happened.
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

  // The badge clearing is worthless if the page reloaded to do it.
  expect(
    await page.evaluate(
      () => (window as unknown as { __pad149?: true }).__pad149 === true
    ),
    "the page must not have reloaded"
  ).toBe(true);

  // And it stays gone once the thread has settled.
  await expect(badge).toBeHidden();
});
