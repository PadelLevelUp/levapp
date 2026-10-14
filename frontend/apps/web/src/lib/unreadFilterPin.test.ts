import { describe, expect, it } from "vitest";
import type { Conversation } from "@/types";
import { withPinnedRow } from "./unreadFilterPin";

const row = (id: string, at: string, unreadCount = 0): Conversation =>
  ({ id, participantId: id, participantName: id, lastMessage: "", lastMessageAt: at, unreadCount, messages: [] }) as Conversation;

// messaging.conversations rule 17 (PAD-648): on web, the open conversation stays in "Não lidas".
describe("withPinnedRow", () => {
  const a = row("1", "2026-10-14T12:00:00Z", 2);
  const c = row("3", "2026-10-14T08:00:00Z", 1);
  const opened = row("2", "2026-10-14T10:00:00Z", 1);

  it("puts the open row back, read, in its place by last message", () => {
    expect(withPinnedRow([a, c], opened, "2").map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(withPinnedRow([a, c], opened, "2")[1].unreadCount).toBe(0);
  });

  it("changes nothing when the row is listed, nothing is pinned, or another row is open", () => {
    expect(withPinnedRow([a, opened, c], opened, "2")).toEqual([a, opened, c]);
    expect(withPinnedRow([a, c], null, "2")).toEqual([a, c]);
    expect(withPinnedRow([a, c], opened, "9")).toEqual([a, c]);
    expect(withPinnedRow([a, c], opened, null)).toEqual([a, c]);
  });
});
