import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

// PAD-33: Chat messages show incorrect timestamp (1 hour behind Lisbon time).
//
// Root cause: `sent_at` is stored as naive UTC but was serialized via
// `.isoformat()` WITHOUT any timezone offset (e.g. "2026-07-01T17:00:00").
// The browser's `new Date(iso)` then interprets that naive string as LOCAL
// time, so a viewer in Lisbon (UTC+1 in summer) sees the wall-clock UTC value
// (17:00) instead of their local time (18:00) — one hour behind.
//
// Fix: serialize timestamps as UTC-aware ISO 8601 strings (with an explicit
// "+00:00"/"Z" offset) so the client parses them correctly and renders local.
//
// This test asserts on the API contract, which is timezone-independent and
// pins the exact defect: every message `timestamp` (and conversation
// `lastMessageAt`) must carry an explicit UTC offset.

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/;

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);
});

// US-27: message timestamps are serialized with an explicit UTC offset
test("PAD-33: conversation message timestamps carry an explicit UTC offset", async ({ page }) => {
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
      { timeout: 10_000 }
    ),
    page.getByText("E2E Student").first().click(),
  ]);

  const body = await resp.json();
  const messages = body.messages ?? [];
  expect(messages.length).toBeGreaterThan(0);

  for (const msg of messages) {
    expect(
      typeof msg.timestamp === "string" && OFFSET_RE.test(msg.timestamp),
      `message timestamp "${msg.timestamp}" must carry an explicit UTC offset`
    ).toBe(true);
  }
});

// The conversation list preview timestamp (lastMessageAt) must also be UTC-aware
test("PAD-33: conversation list lastMessageAt carries an explicit UTC offset", async ({ page }) => {
  const resp = await page.waitForResponse(
    (r) => /\/api\/app\/conversations(\?|$)/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );

  const body = await resp.json();
  const conversations = body.conversations ?? body ?? [];
  const withMessage = conversations.filter((c: { lastMessageAt: string | null }) => c.lastMessageAt);
  expect(withMessage.length).toBeGreaterThan(0);

  for (const conv of withMessage) {
    expect(
      typeof conv.lastMessageAt === "string" && OFFSET_RE.test(conv.lastMessageAt),
      `lastMessageAt "${conv.lastMessageAt}" must carry an explicit UTC offset`
    ).toBe(true);
  }
});
