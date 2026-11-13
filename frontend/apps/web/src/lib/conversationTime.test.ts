import { describe, expect, it } from "vitest";
import { formatConversationTimestamp } from "./conversationTime";

// Fixed reference "now": Monday, 2026-07-27 15:00 local.
const NOW = new Date(2026, 6, 27, 15, 0, 0);

describe("formatConversationTimestamp (PAD-98)", () => {
  it("returns empty string for null", () => {
    expect(formatConversationTimestamp(null, { yesterdayLabel: "Yesterday", now: NOW })).toBe("");
  });

  it("shows time only for a message sent today", () => {
    const today = new Date(2026, 6, 27, 9, 5, 0).toISOString();
    const out = formatConversationTimestamp(today, { yesterdayLabel: "Yesterday", now: NOW });
    // Time-only (HH:MM style), no weekday/date text.
    expect(out).toMatch(/\d{1,2}[:.]\d{2}/);
    expect(out).not.toMatch(/yesterday/i);
  });

  it("shows the yesterday label for a message sent yesterday", () => {
    const yesterday = new Date(2026, 6, 26, 10, 0, 0).toISOString();
    expect(formatConversationTimestamp(yesterday, { yesterdayLabel: "Yesterday", now: NOW })).toBe(
      "Yesterday",
    );
    expect(formatConversationTimestamp(yesterday, { yesterdayLabel: "Ontem", now: NOW })).toBe(
      "Ontem",
    );
  });

  it("[MESSAGING-CONVERSATIONS-33] shows the day and month, no year, for an earlier message this year (EN)", () => {
    // 2026-07-23 is 4 days before the reference, 2026-07-01 is 26: both read as day and month.
    const thursday = new Date(2026, 6, 23, 12, 0, 0).toISOString();
    const older = new Date(2026, 6, 1, 12, 0, 0).toISOString();
    const opts = { language: "en", yesterdayLabel: "Yesterday", now: NOW };
    expect(formatConversationTimestamp(thursday, opts)).toBe("23 Jul");
    expect(formatConversationTimestamp(older, opts)).toBe("1 Jul");
  });

  it("[MESSAGING-CONVERSATIONS-33] localizes the month for PT", () => {
    const thursday = new Date(2026, 6, 23, 12, 0, 0).toISOString();
    expect(
      formatConversationTimestamp(thursday, { language: "pt", yesterdayLabel: "Ontem", now: NOW }),
    ).toBe("23 jul");
  });

  it("[MESSAGING-CONVERSATIONS-33] adds the year for a message from an earlier year", () => {
    const lastYear = new Date(2025, 11, 31, 12, 0, 0).toISOString();
    expect(
      formatConversationTimestamp(lastYear, { language: "en", yesterdayLabel: "Yesterday", now: NOW }),
    ).toBe("31 Dec 2025");
    expect(
      formatConversationTimestamp(lastYear, { language: "pt", yesterdayLabel: "Ontem", now: NOW }),
    ).toBe("31 dez 2025");
  });
});
