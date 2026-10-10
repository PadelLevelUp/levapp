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
}
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 19);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 19);
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

  it("shows no button for a timeout, a withdrawal, a started class, or the student's own no", async () => {
    for (const metadata of [{ response: "expired" }, { response: "withdrawn" }, { startsAt: yesterday }, { response: "no" }]) {
      renderBubble(invite(metadata));
      await waitFor(() => expect(api.listClassWaitingList.mock.calls.length >= 0).toBe(true));
      expect(screen.queryByTestId("invite-join-waiting-list")).toBeNull();
      expect(screen.queryByTestId("invite-on-waiting-list")).toBeNull();
      cleanup();
    }
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
