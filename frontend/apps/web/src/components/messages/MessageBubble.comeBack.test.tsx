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
import { toast } from "sonner";
import { mergeEditedMessage } from "@levelup/api";

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

beforeEach(() => { api.respondToReminder.mockReset(); api.joinClassWaitingList.mockClear(); vi.mocked(toast.error).mockClear(); vi.mocked(toast.info).mockClear(); });
afterEach(cleanup);

describe("PAD-684 the reminder bubble's 'Afinal vou'", () => {
  it("[ATTENDANCE-CONFIRM-32] offers it after a recorded no on a class that has not started; confirmed shows the recorded yes", async () => {
    api.respondToReminder.mockResolvedValue({ action: "confirmed" });
    renderBubble(reminder({}));
    fireEvent.click(await screen.findByTestId("bubble-come-back"));
    await waitFor(() => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes"));
    await screen.findByText("messages.confirmed");
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
  });

  it("[ATTENDANCE-CONFIRM-33] spot_filled: the spot-taken line and the join for that occurrence; joining shows the list state", async () => {
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

/** attendance.confirm rule 32: the bubble reads the `comeBack` served on the reminder message. */
describe("rule 32 the bubble's 'Afinal vou' follows the served comeBack", () => {
  const withComeBack = (comeBack: Message["comeBack"], metadata: Record<string, unknown> = {}) =>
    ({ ...reminder(metadata), comeBack }) as Message;
  const ids = () => ({
    button: !!screen.queryByTestId("bubble-come-back"),
    spotTaken: !!screen.queryByTestId("bubble-come-back-spot-taken"),
    join: !!screen.queryByTestId("bubble-come-back-waiting-list"),
    onList: !!screen.queryByTestId("bubble-come-back-on-waiting-list"),
  });

  it('[ATTENDANCE-CONFIRM-46] the bubble offers "Afinal vou" only for rejoin', async () => {
    const cases: Array<[Message["comeBack"], ReturnType<typeof ids>]> = [
      ["rejoin", { button: true, spotTaken: false, join: false, onList: false }],
      ["waiting_list", { button: false, spotTaken: true, join: true, onList: false }],
      ["on_waiting_list", { button: false, spotTaken: false, join: false, onList: true }],
      [null, { button: false, spotTaken: false, join: false, onList: false }],
    ];
    for (const [comeBack, expected] of cases) {
      renderBubble(withComeBack(comeBack));
      await screen.findByText("Vens à aula?");
      expect({ comeBack, ...ids() }).toEqual({ comeBack, ...expected });
      cleanup();
    }
  });

  it("[ATTENDANCE-CONFIRM-46] waiting_list: the join is for the reminder's occurrence, then the list state", async () => {
    renderBubble(withComeBack("waiting_list"));
    fireEvent.click(await screen.findByTestId("bubble-come-back-waiting-list"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith({ model: "LessonInstance", originalId: 7 }));
    await screen.findByTestId("bubble-come-back-on-waiting-list");
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
  });

  it("[ATTENDANCE-CONFIRM-46] an older server (no comeBack key) keeps today's button after a recorded no", async () => {
    renderBubble(reminder({}));
    expect(await screen.findByTestId("bubble-come-back")).toBeInTheDocument();
  });

  it("[ATTENDANCE-CONFIRM-46] a live edit without the key keeps the value last read", async () => {
    const read = withComeBack("waiting_list");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (m: Message) => (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <MessageBubble message={m} isMine={false} userId={5} participantName="Coach" onReply={noop} onEdit={noop} onDelete={noop} onReaction={noop} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    const { rerender } = render(view(read));
    await screen.findByTestId("bubble-come-back-spot-taken");
    const { comeBack: _omitted, ...live } = read;
    rerender(view(mergeEditedMessage(read, { ...live, content: "Vens à aula? (editada)" } as Message)));
    await screen.findByText("Vens à aula? (editada)");
    expect(screen.getByTestId("bubble-come-back-spot-taken")).toBeInTheDocument();
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
  });

  it("[ATTENDANCE-CONFIRM-46] a tap answered spot_filled moves to the waiting-list line, as information, never an error", async () => {
    api.respondToReminder.mockResolvedValue({ action: "spot_filled" });
    renderBubble(withComeBack("rejoin"));
    fireEvent.click(await screen.findByTestId("bubble-come-back"));
    await screen.findByTestId("bubble-come-back-spot-taken");
    expect(screen.getByTestId("bubble-come-back-waiting-list")).toBeInTheDocument();
    expect(screen.queryByTestId("bubble-come-back")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("calendar.detail.spotFilled");
  });

  it("[ATTENDANCE-CONFIRM-46] a no given in this session outdates the null read before it: today's button", async () => {
    api.respondToReminder.mockResolvedValue({ action: "declined" });
    renderBubble(withComeBack(null, { responded: false, response: undefined }));
    fireEvent.click(await screen.findByTestId("message-reminder-no"));
    await waitFor(() => expect(api.respondToReminder).toHaveBeenCalledWith(7, "no"));
    expect(await screen.findByTestId("bubble-come-back")).toBeInTheDocument();
  });
});
