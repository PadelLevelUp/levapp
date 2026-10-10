/**
 * notifications.invitations rule 9 (PAD-563): an invitation the coach answered for the student
 * reads "marked by the coach" on both sides of the chat, with the Yes/No buttons gone.
 * Asserted by test id, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;

function renderBubble(message: Message, isMine: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MessageBubble
          message={message}
          isMine={isMine}
          userId={isMine ? 2 : 5}
          participantName="Dinis"
          onReply={noop}
          onEdit={noop}
          onDelete={noop}
          onReaction={noop}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function invite(metadata: Message["metadata"]): Message {
  return {
    id: "1",
    senderId: 2,
    content: "Há uma vaga na aula de sexta",
    timestamp: "2026-10-09T18:00:00Z",
    isRead: true,
    messageType: "notification_invite",
    metadata: { notificationEventId: 11, lessonInstanceId: 3, ...metadata },
  };
}

afterEach(cleanup);

describe("an invitation the coach answered for the student", () => {
  it("shows the student 'accepted by the coach' with no buttons", () => {
    renderBubble(invite({ responded: true, response: "yes", answeredBy: "coach" }), false);
    expect(screen.getByTestId("invite-recorded-by-coach")).toHaveTextContent("messages.acceptedByCoach");
    expect(screen.queryByTestId("invite-respond-yes")).toBeNull();
    expect(screen.queryByTestId("invite-respond-no")).toBeNull();
  });

  it("shows the student 'declined by the coach' with no buttons", () => {
    renderBubble(invite({ responded: true, response: "no", answeredBy: "coach" }), false);
    expect(screen.getByTestId("invite-recorded-by-coach")).toHaveTextContent("messages.declinedByCoach");
    expect(screen.queryByTestId("invite-respond-yes")).toBeNull();
  });

  it("shows the coach the same badge instead of 'waiting for response'", () => {
    renderBubble(invite({ responded: true, response: "yes", answeredBy: "coach" }), true);
    expect(screen.getByTestId("invite-recorded-by-coach")).toHaveTextContent("messages.acceptedByCoach");
    expect(screen.queryByText("messages.waitingForResponse")).toBeNull();
  });

  it("keeps the student's own answer as a plain badge", () => {
    renderBubble(invite({ responded: true, response: "yes", answeredBy: "student" }), false);
    expect(screen.getByTestId("invite-accepted")).toHaveTextContent("messages.accepted");
    expect(screen.queryByTestId("invite-recorded-by-coach")).toBeNull();
  });

  it("still offers Yes/No while nothing is on record", () => {
    renderBubble(invite({ responded: false }), false);
    expect(screen.getByTestId("invite-respond-yes")).toBeTruthy();
    expect(screen.getByTestId("invite-respond-no")).toBeTruthy();
  });
});
