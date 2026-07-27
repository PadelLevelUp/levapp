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

  it("shows a weekday abbreviation for a message within the last week (EN)", () => {
    // 2026-07-23 is a Thursday, 4 days before the reference Monday.
    const thursday = new Date(2026, 6, 23, 12, 0, 0).toISOString();
    expect(
      formatConversationTimestamp(thursday, { language: "en", yesterdayLabel: "Yesterday", now: NOW }),
    ).toBe("Thu");
  });

  it("localizes the weekday abbreviation for PT", () => {
    const thursday = new Date(2026, 6, 23, 12, 0, 0).toISOString();
    const out = formatConversationTimestamp(thursday, {
      language: "pt",
      yesterdayLabel: "Ontem",
      now: NOW,
    });
    // PT weekday abbreviations are not the English ones.
    expect(out).not.toBe("Thu");
    expect(out.length).toBeGreaterThan(0);
  });

  it("shows a short date for messages older than a week", () => {
    // 2026-07-01 is 26 days before the reference — older than a week.
    const older = new Date(2026, 6, 1, 12, 0, 0).toISOString();
    const out = formatConversationTimestamp(older, {
      language: "en",
      yesterdayLabel: "Yesterday",
      now: NOW,
    });
    // Short localized date contains the year.
    expect(out).toMatch(/2026/);
  });
});
