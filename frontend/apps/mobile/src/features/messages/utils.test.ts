import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatConversationTime,
  formatMessageTime,
  initialsOf,
  normalizeId,
} from "./utils";

// Every ISO string here is deliberately timezone-less: date-fns `format` renders in
// local time, so a trailing `Z` would make these assertions pass only in UTC.

describe("normalizeId", () => {
  it("stringifies both shapes the backend returns", () => {
    expect(normalizeId(42)).toBe("42");
    expect(normalizeId("42")).toBe("42");
  });

  it("maps absent ids to null rather than \"null\"/\"undefined\"", () => {
    expect(normalizeId(null)).toBeNull();
    expect(normalizeId(undefined)).toBeNull();
  });

  it("keeps 0 as a real id", () => {
    expect(normalizeId(0)).toBe("0");
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(initialsOf("ana silva")).toBe("AS");
    expect(initialsOf("Ana Beatriz Silva")).toBe("AB");
  });

  it("handles a single name and stray whitespace", () => {
    expect(initialsOf("Ana")).toBe("A");
    expect(initialsOf("  Ana   Silva  ")).toBe("AS");
  });

  it("falls back to ? when there is no name", () => {
    expect(initialsOf(undefined)).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("")).toBe("?");
  });
});

describe("formatMessageTime", () => {
  it("renders 24h local time (PAD-33)", () => {
    expect(formatMessageTime("2026-09-04T14:30:00")).toBe("14:30");
    expect(formatMessageTime("2026-09-04T09:05:00")).toBe("09:05");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatMessageTime("not-a-date")).toBe("");
  });
});

describe("formatConversationTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Local-time construction on purpose — no timezone assumption.
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the time for today", () => {
    expect(formatConversationTime("2026-09-04T09:30:00")).toBe("09:30");
  });

  it("shows Yesterday for yesterday", () => {
    expect(formatConversationTime("2026-09-03T22:10:00")).toBe("Yesterday");
  });

  it("shows a day+month for earlier this year", () => {
    expect(formatConversationTime("2026-02-14T08:00:00")).toBe("14 Feb");
  });

  it("adds the year for anything older", () => {
    expect(formatConversationTime("2025-12-31T08:00:00")).toBe("31 Dec 2025");
  });

  it("returns an empty string for null or garbage", () => {
    expect(formatConversationTime(null)).toBe("");
    expect(formatConversationTime("not-a-date")).toBe("");
  });
});
