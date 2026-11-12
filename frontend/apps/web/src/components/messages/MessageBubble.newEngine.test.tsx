/**
 * PAD-920 (notifications.invitations NB1–NB4): a new-engine invitation bubble. Its state is the
 * message's metadata, kept current by `message_edited`; the bubble re-renders from it. Asserted by
 * the shared test ids, never by copy (`t` returns the key).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const respondToEngineInvitation = vi.fn();
vi.mock("@/api/notificationEngine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  respondToEngineInvitation: (...a: unknown[]) => respondToEngineInvitation(...a),
}));

import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;
const FUTURE = "2099-01-01T19:00:00Z";

function bubble(id: string, metadata: Record<string, unknown>, isMine = false) {
  const message: Message = {
    id,
    senderId: 2,
    content: "Há uma vaga na aula de quinta",
    timestamp: "2026-11-12T18:00:00Z",
    isRead: true,
    messageType: "notification_invite",
    metadata: { engine: "new", invitationId: 41, lessonInstanceId: 3, kind: "invite", startsAt: FUTURE, ...metadata },
  };
  return (
    <MessageBubble
      key={id}
      message={message}
      isMine={isMine}
      userId={isMine ? 2 : 5}
      participantName="Dinis"
      onReply={noop}
      onEdit={noop}
      onDelete={noop}
      onReaction={noop}
    />
  );
}

function renderAll(nodes: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (n: React.ReactNode) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{n}</QueryClientProvider>
    </MemoryRouter>
  );
  const r = render(wrap(nodes));
  return { rerender: (n: React.ReactNode) => r.rerender(wrap(n)) };
}

beforeEach(() => respondToEngineInvitation.mockReset());
afterEach(cleanup);

describe("PAD-920 the new engine's invitation bubble on web", () => {
  it("[NOTIFICATIONS-INVITATIONS-116] renders the new engine's states and follows a live edit", () => {
    const { rerender } = renderAll(bubble("m1", { state: "open" }));
    expect(screen.getByTestId("invite-respond-yes-41")).toBeTruthy();
    expect(screen.getByTestId("invite-respond-no-41")).toBeTruthy();
    // The old engine's ids are not used on a new-engine bubble.
    expect(screen.queryByTestId("invite-respond-yes")).toBeNull();

    // A live `message_edited` turns it sorry: no buttons, the sorry line.
    rerender(bubble("m1", { state: "sorry" }));
    expect(screen.getByTestId("invite-state-41-sorry")).toHaveTextContent("messages.engineInvite.sorry");
    expect(screen.queryByTestId("invite-respond-yes-41")).toBeNull();

    // A reoffer arrives for the same invitation: the first bubble reads "reopened below", the new one asks.
    rerender(
      <>
        {bubble("m1", { state: "reoffered" })}
        {bubble("m2", { state: "open", kind: "reoffer" })}
      </>,
    );
    expect(screen.getByTestId("invite-state-41-reoffered")).toHaveTextContent("messages.engineInvite.reoffered");
    expect(screen.getAllByTestId("invite-respond-yes-41")).toHaveLength(1);
    expect(screen.getAllByTestId("invite-respond-no-41")).toHaveLength(1);
  });

  it("shows the coach 'no longer counts' on their copy, and no buttons", () => {
    renderAll(bubble("m1", { state: "open", countsUntil: "2000-01-01T00:00:00Z" }, true));
    expect(screen.getByTestId("invite-state-41-open")).toHaveTextContent("messages.engineInvite.notCounting");
    expect(screen.queryByTestId("invite-respond-yes-41")).toBeNull();
  });

  it("[NOTIFICATIONS-INVITATIONS-122] answers by invitation id and keeps the newest state", async () => {
    // The route answers `sorry`, but a live edit made the invitation `reoffered` while it was in flight.
    let answer!: (v: unknown) => void;
    respondToEngineInvitation.mockReturnValue(new Promise((r) => (answer = r)));
    const { rerender } = renderAll(bubble("m1", { state: "open" }));
    fireEvent.click(screen.getByTestId("invite-respond-yes-41"));
    expect(respondToEngineInvitation).toHaveBeenCalledWith({ invitationId: 41, action: "yes" });
    rerender(bubble("m1", { state: "reoffered" }));
    await act(async () => answer({ action: "sorry", invitationId: 41 }));
    expect(screen.getByTestId("invite-state-41-reoffered")).toBeTruthy();
    expect(screen.queryByTestId("invite-state-41-sorry")).toBeNull();
  });

  it("shows the engine's answer until the live edit arrives", async () => {
    respondToEngineInvitation.mockResolvedValue({ action: "sorry", invitationId: 41 });
    renderAll(bubble("m1", { state: "open" }));
    fireEvent.click(screen.getByTestId("invite-respond-yes-41"));
    await waitFor(() => expect(screen.getByTestId("invite-state-41-sorry")).toBeTruthy());
  });

  it("shows no buttons once the class has started", () => {
    renderAll(bubble("m1", { state: "open", startsAt: "2000-01-01T00:00:00Z" }));
    expect(screen.getByTestId("invite-state-41-started")).toHaveTextContent("messages.engineInvite.classStarted");
    expect(screen.queryByTestId("invite-respond-yes-41")).toBeNull();
  });

  it("drops the buttons when the class starts while the bubble is on screen", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    try {
      vi.setSystemTime(new Date("2026-11-19T18:59:00Z"));
      renderAll(bubble("m1", { state: "open", startsAt: "2026-11-19T19:00:00Z" }));
      expect(screen.getByTestId("invite-respond-yes-41")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      expect(screen.getByTestId("invite-state-41-started")).toBeTruthy();
      expect(screen.queryByTestId("invite-respond-yes-41")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mounts the new-engine approval card in the conversation, with Sim and no Ignorar", () => {
    const message: Message = {
      id: "m7", senderId: 1, content: "Pedido de convites", timestamp: "2026-11-12T18:00:00Z", isRead: true,
      messageType: "replacement_approval",
      metadata: { engine: "new", requestId: 42, lessonInstanceId: 7, responded: false, state: "pending",
        spotTypes: [{ side: "left", levelId: null, levelLabel: null, count: 1, queue: [{ playerId: "s1", name: "Rita", tier: 2, rank: 1 }] }] },
    };
    renderAll(
      <MessageBubble message={message} isMine={false} userId={2} participantName="Assistente"
        onReply={noop} onEdit={noop} onDelete={noop} onReaction={noop} />,
    );
    expect(screen.getByTestId("approval-yes")).toBeTruthy();
    expect(screen.queryByTestId("approval-dismiss")).toBeNull();
  });
});
