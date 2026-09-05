import { enUS, pt } from "date-fns/locale";
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
  // PAD-157: month names and the "yesterday" label are locale-dependent, so
  // the caller supplies both. Making them required (rather than defaulting to
  // English) is the point — a new call site cannot silently reintroduce the
  // bug this ticket fixes.
  const EN = { locale: enUS, yesterdayLabel: "Yesterday" };
  const PT = { locale: pt, yesterdayLabel: "Ontem" };

  beforeEach(() => {
    vi.useFakeTimers();
    // Local-time construction on purpose — no timezone assumption.
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the time for today", () => {
    expect(formatConversationTime("2026-09-04T09:30:00", EN)).toBe("09:30");
    expect(formatConversationTime("2026-09-04T09:30:00", PT)).toBe("09:30");
  });

  it("shows the caller's yesterday label, not a hardcoded English one", () => {
    expect(formatConversationTime("2026-09-03T22:10:00", EN)).toBe("Yesterday");
    expect(formatConversationTime("2026-09-03T22:10:00", PT)).toBe("Ontem");
  });

  it("renders the month in the caller's locale for earlier this year", () => {
    expect(formatConversationTime("2026-02-14T08:00:00", EN)).toBe("14 Feb");
    expect(formatConversationTime("2026-02-14T08:00:00", PT)).toBe("14 fev");
  });

  it("adds the year for anything older, still localized", () => {
    expect(formatConversationTime("2025-12-31T08:00:00", EN)).toBe("31 Dec 2025");
    expect(formatConversationTime("2025-12-31T08:00:00", PT)).toBe("31 dez 2025");
  });

  it("returns an empty string for null or garbage", () => {
    expect(formatConversationTime(null, PT)).toBe("");
    expect(formatConversationTime("not-a-date", PT)).toBe("");
  });
});
