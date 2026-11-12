/**
 * PAD-920 (dashboard.blocks NA3): the coach alert reaches the coach as a text bubble with a link
 * to its class, from the message's `href`, or else from its `lessonInstanceId` (an older payload).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<object>()), useNavigate: () => navigate }));

import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;

function renderAlert(id: string, metadata: Record<string, unknown>) {
  const message: Message = {
    id,
    senderId: 1,
    content: "Iniciação na quinta às 19:00: 1 vaga(s) por preencher e já não há ninguém para convidar automaticamente.",
    timestamp: "2026-11-12T18:00:00Z",
    isRead: true,
    messageType: "engine_alert",
    metadata: { engine: "new", lessonInstanceId: 12, reason: "no_candidate", side: "right", count: 1, ...metadata },
  };
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <MessageBubble message={message} isMine={false} userId={2} participantName="Assistente"
          onReply={noop} onEdit={noop} onDelete={noop} onReaction={noop} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe("PAD-920 the coach alert's message on web", () => {
  it("[DASHBOARD-BLOCKS-52] links the alert message to its class", () => {
    renderAlert("m9", { href: "/calendar?classId=lessoninstance-12&date=2026-11-19", date: "2026-11-19" });
    fireEvent.click(screen.getByTestId("engine-alert-open-class-m9"));
    expect(navigate).toHaveBeenLastCalledWith("/calendar?classId=lessoninstance-12&date=2026-11-19");
    cleanup();
    // An older payload with only the lesson instance still opens the class.
    renderAlert("m8", {});
    fireEvent.click(screen.getByTestId("engine-alert-open-class-m8"));
    expect(navigate).toHaveBeenLastCalledWith("/calendar?classId=lessoninstance-12");
  });
});
