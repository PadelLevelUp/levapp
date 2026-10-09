import { enUS, pt } from "date-fns/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "@levelup/types";

import {
  formatConversationTime,
  formatMessageTime,
  initialsOf,
  mergeEditedMessage,
  messageCopyText,
  normalizeId,
  roleLabelKey,
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

describe("roleLabelKey", () => {
  // PAD-158: the conversation list printed the raw backend enum with a
  // `capitalize` class, so a Portuguese device showed "Player". Web maps the
  // enum to messages.role* keys; this is the same mapping, kept pure so the
  // component only has to call t().
  it("maps the backend role enum to a translation key", () => {
    expect(roleLabelKey("coach")).toBe("messages.roleCoach");
    expect(roleLabelKey("player")).toBe("messages.rolePlayer");
    expect(roleLabelKey("assistant")).toBe("messages.roleAssistant");
  });

  it("is case-insensitive, like web's getRoleLabel", () => {
    expect(roleLabelKey("Coach")).toBe("messages.roleCoach");
    expect(roleLabelKey("PLAYER")).toBe("messages.rolePlayer");
  });

  it("returns null for an unknown or missing role so the caller can fall back", () => {
    // Returning a key here would render a raw "messages.roleReferee" path.
    expect(roleLabelKey("referee")).toBeNull();
    expect(roleLabelKey(undefined)).toBeNull();
    expect(roleLabelKey(null)).toBeNull();
    expect(roleLabelKey("")).toBeNull();
  });
});

describe("messageCopyText", () => {
  it("copies the message content verbatim, inner whitespace included", () => {
    expect(messageCopyText({ content: "  Até logo!  ", isDeleted: false })).toBe(
      "  Até logo!  "
    );
    expect(messageCopyText({ content: "line 1\nline 2" })).toBe("line 1\nline 2");
  });

  it("refuses a deleted message — its bubble shows chrome, not content", () => {
    expect(messageCopyText({ content: "gone", isDeleted: true })).toBeNull();
  });

  it("refuses an empty or whitespace-only message rather than wiping the clipboard", () => {
    expect(messageCopyText({ content: "" })).toBeNull();
    expect(messageCopyText({ content: "   \n " })).toBeNull();
  });

  it("refuses a missing message or a non-string body", () => {
    expect(messageCopyText(null)).toBeNull();
    expect(messageCopyText(undefined)).toBeNull();
    expect(
      messageCopyText({ content: undefined as unknown as string })
    ).toBeNull();
  });
});

// messaging.sse-realtime rule 18 (PAD-563): a live edit carries the whole message; the cache
// takes its content, edited flag and metadata, and keeps what the viewer-less payload cannot know.
describe("mergeEditedMessage", () => {
  const cached: Message = {
    id: "7",
    senderId: 2,
    content: "Convite",
    timestamp: "2026-10-09T18:00:00",
    isRead: true,
    status: "read",
    edited: false,
    messageType: "notification_invite",
    metadata: { notificationEventId: 11, responded: false },
  };

  it("takes the payload's metadata and edited flag, so a coach-recorded answer retires the buttons live", () => {
    const merged = mergeEditedMessage(cached, {
      ...cached,
      isRead: false,
      status: "delivered",
      edited: false,
      metadata: { notificationEventId: 11, responded: true, response: "yes", answeredBy: "coach" },
    });
    expect(merged.metadata).toEqual({ notificationEventId: 11, responded: true, response: "yes", answeredBy: "coach" });
    expect(merged.edited).toBe(false);
    expect(merged.isRead).toBe(true);
    expect(merged.status).toBe("read");
  });

  it("still applies a text edit as edited", () => {
    const merged = mergeEditedMessage(cached, { ...cached, content: "Convite (corrigido)", edited: true });
    expect(merged.content).toBe("Convite (corrigido)");
    expect(merged.edited).toBe(true);
    expect(merged.metadata).toEqual(cached.metadata);
  });
});
