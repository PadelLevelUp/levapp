/**
 * messaging.messages rule 3 (PAD-639, B-547): a reply quoting a deleted message shows
 * "Message deleted", never the old text. Asserted by key (`t` returns the key).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;

const reply: Message = {
  id: "51", senderId: 2, content: "what number?", timestamp: "2026-10-12T10:01:00Z", isRead: true, replyTo: "50",
};

function renderReply(quoted: Message) {
  const client = new QueryClient();
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MessageBubble message={reply} isMine userId={2} participantName="Ana" replyToMessage={quoted}
          onReply={noop} onEdit={noop} onDelete={noop} onReaction={noop} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const original: Message = {
  id: "50", senderId: 1, content: "call me on 912 345 678", timestamp: "2026-10-12T10:00:00Z", isRead: true,
};

describe("a reply quoting a deleted message (PAD-639)", () => {
  it("shows the quoted text while the original is live", () => {
    renderReply(original);
    expect(screen.getByText("call me on 912 345 678")).toBeInTheDocument();
  });

  it("shows 'Message deleted' and not the old text once the original is deleted", () => {
    renderReply({ ...original, isDeleted: true });
    expect(screen.queryByText("call me on 912 345 678")).toBeNull();
    expect(screen.getByText("messages.messageDeleted")).toBeInTheDocument();
  });
});
