/**
 * PAD-577 (notifications.invitations rule 15a): an invitation retired because someone else took the
 * spot offers "Juntar-me à lista de espera"; joining shows "Estás na lista de espera" with Leave.
 * No button for a timeout, a withdrawal, a started class or a student already on the list.
 * Asserted by test id; `t` returns the key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";
import { lisbonNowMs } from "@levelup/config";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
const api = vi.hoisted(() => ({
  listClassWaitingList: vi.fn(() => Promise.resolve([] as unknown[])),
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
  leaveClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: false })),
}));
vi.mock("@/api/academyClasses", () => api);
import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;
function renderBubble(message: Message) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MessageBubble message={message} isMine={false} userId={5} participantName="Coach" onReply={noop} onEdit={noop} onDelete={noop} onReaction={noop} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return client;
}
// Club wall-clock digits, as the server writes `startsAt` and as the bubble compares them.
const tomorrow = new Date(lisbonNowMs() + 86_400_000).toISOString().slice(0, 19);
const yesterday = new Date(lisbonNowMs() - 86_400_000).toISOString().slice(0, 19);
function invite(metadata: Record<string, unknown>): Message {
  return {
    id: "1", senderId: 2, content: "Há uma vaga", timestamp: "2026-10-09T18:00:00Z", messageType: "notification_invite",
    metadata: { lessonInstanceId: 7, notificationEventId: 3, responded: true, response: "spot_filled", startsAt: tomorrow, ...metadata },
  } as unknown as Message;
}

beforeEach(() => { api.listClassWaitingList.mockReset().mockImplementation(() => Promise.resolve([])); api.joinClassWaitingList.mockClear(); api.leaveClassWaitingList.mockClear(); });
afterEach(cleanup);

describe("PAD-577 a lost spot offers that class's waiting list", () => {
  it("offers the join on a spot someone else took, and joining shows the on-list state with Leave", async () => {
    renderBubble(invite({}));
    const join = await screen.findByTestId("invite-join-waiting-list");
    fireEvent.click(join);
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 }));
    await screen.findByTestId("invite-on-waiting-list");
    expect(screen.queryByTestId("invite-join-waiting-list")).toBeNull();
    fireEvent.click(screen.getByTestId("invite-leave-waiting-list"));
    await waitFor(() => expect(api.leaveClassWaitingList).toHaveBeenCalledWith(7));
    await screen.findByTestId("invite-join-waiting-list");
  });

  it.each([
    ["a timeout", { response: "expired" }, false],
    ["a withdrawal", { response: "withdrawn" }, false],
    ["the student's own no", { response: "no" }, false],
    ["a class that already started", { startsAt: yesterday }, true],
  ])("shows no button for %s", async (_label, metadata, fetchesLists) => {
    const client = renderBubble(invite(metadata));
    await screen.findByText("Há uma vaga"); // the bubble is on screen before the negatives are read
    if (fetchesLists) {
      // A lost spot asks for the student's lists; the decision is read only after they arrived.
      await waitFor(() => expect(client.getQueryState(["class-waiting-list"])?.status).toBe("success"));
    } else {
      expect(api.listClassWaitingList).not.toHaveBeenCalled();
    }
    expect(screen.queryByTestId("invite-join-waiting-list")).toBeNull();
    expect(screen.queryByTestId("invite-on-waiting-list")).toBeNull();
  });

  it("PAD-581: an invitation withdrawn for side balance says so and offers the list too", async () => {
    renderBubble(invite({ response: "side_balanced" }));
    expect(await screen.findByText("messages.noLongerNeededOnSide")).toBeInTheDocument();
    expect(screen.queryByText("messages.spotFilled")).toBeNull();
    fireEvent.click(await screen.findByTestId("invite-join-waiting-list"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 }));
  });

  it("reads the student's own lists: already on this class's list shows the on-list state, not the button", async () => {
    api.listClassWaitingList.mockImplementation(() => Promise.resolve([{ kind: "waiting_list", id: 1, lessonInstanceId: 7, status: "active" }]));
    renderBubble(invite({}));
    await screen.findByTestId("invite-on-waiting-list");
    expect(screen.queryByTestId("invite-join-waiting-list")).toBeNull();
  });

  it("hides the button after a refusal from the server", async () => {
    api.joinClassWaitingList.mockImplementationOnce(() => Promise.reject({ response: { data: { code: "class_closed" } } }));
    renderBubble(invite({}));
    fireEvent.click(await screen.findByTestId("invite-join-waiting-list"));
    await waitFor(() => expect(screen.queryByTestId("invite-join-waiting-list")).toBeNull());
    expect(screen.queryByTestId("invite-on-waiting-list")).toBeNull();
  });
});
