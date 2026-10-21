/**
 * PAD-684 (attendance.confirm rule 28): a reminder whose recorded answer is "no" on a class that has
 * not started offers "Afinal vou"; the bubble renders the SERVER's answer (confirmed -> the recorded
 * yes; spot_filled -> the spot-taken line + the waiting-list join). Asserted by test id.
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
  respondToReminder: vi.fn(),
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
  listClassWaitingList: vi.fn(() => Promise.resolve([] as unknown[])),
  leaveClassWaitingList: vi.fn(),
}));
vi.mock("@/api/academyClasses", () => ({
  joinClassWaitingList: api.joinClassWaitingList,
  listClassWaitingList: api.listClassWaitingList,
  leaveClassWaitingList: api.leaveClassWaitingList,
}));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  respondToReminder: api.respondToReminder,
}));
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
const tomorrow = new Date(lisbonNowMs() + 86_400_000).toISOString().slice(0, 19);
const yesterday = new Date(lisbonNowMs() - 86_400_000).toISOString().slice(0, 19);
function reminder(metadata: Record<string, unknown>): Message {
  return {
    id: "1", senderId: 2, content: "Vens à aula?", timestamp: "2026-10-09T18:00:00Z", messageType: "notification_reminder",
    metadata: { lessonInstanceId: 7, responded: true, response: "no", startsAt: tomorrow, ...metadata },
  } as unknown as Message;
}

beforeEach(() => { api.respondToReminder.mockReset(); api.joinClassWaitingList.mockClear(); });
afterEach(cleanup);

describe("PAD-684 the reminder bubble's 'Afinal vou'", () => {
  it("offers it after a recorded no on a class that has not started; confirmed shows the recorded yes", async () => {
    api.respondToReminder.mockResolvedValue({ action: "confirmed" });
    renderBubble(reminder({}));
    fireEvent.click(await screen.findByTestId("bubble-come-back"));
    await waitFor(() => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes"));
    await screen.findByText("messages.confirmed");
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
  });

  it("spot_filled: the spot-taken line and the join for that occurrence; joining shows the list state", async () => {
    api.respondToReminder.mockResolvedValue({ action: "spot_filled" });
    renderBubble(reminder({}));
    fireEvent.click(await screen.findByTestId("bubble-come-back"));
    await screen.findByTestId("bubble-come-back-spot-taken");
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
    fireEvent.click(screen.getByTestId("bubble-come-back-waiting-list"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 }));
    await screen.findByTestId("bubble-come-back-on-waiting-list");
  });

  it.each([
    ["a class that already started", { startsAt: yesterday }],
    ["an unrecognised recorded answer", { response: "expired" }],
    ["a recorded yes", { response: "yes" }],
  ])("offers nothing for %s", async (_label, metadata) => {
    renderBubble(reminder(metadata));
    await screen.findByText("Vens à aula?");
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
  });
});
