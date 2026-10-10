import { describe, expect, it } from "vitest";
import type { Message } from "@levelup/types";

import { mergeEditedMessage } from "./message-edits";

// messaging.sse-realtime rule 18 (PAD-563): a live edit carries the whole message; the open
// conversation takes its content, edited flag and metadata, and keeps what the viewer-less
// payload cannot know. Shared by web and iOS, so one test.
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

  it("keeps the cached metadata when the payload carries none", () => {
    const merged = mergeEditedMessage(cached, { ...cached, metadata: undefined });
    expect(merged.metadata).toEqual(cached.metadata);
  });
});
