/**
 * calendar.student-blockers rules 19-21, 26, criteria -28 and -32 (PAD-772, owner correction 26 Nov 2026): a student's
 * availability blocker edited from the calendar's block sheet says how many classes the save marked and asks
 * nothing; its form says what saving does; a coach's own block shows no such line and answers no count.
 * `t` returns the key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toast = vi.hoisted(() => vi.fn());
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, o?: { count?: number; title?: string }) =>
      o?.count !== undefined ? `${key}:${o.count}` : o?.title ? `${key}:${o.title}` : key,
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const calendarApi = vi.hoisted(() => ({ getCalendarBlock: vi.fn(), editCalendarBlock: vi.fn(), deleteCalendarBlock: vi.fn() }));
vi.mock("@/api/calendar", () => calendarApi);

import { EventDetailSheet } from "./EventDetailSheet";

const blocker = { id: 5, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, blocksAutoInvitations: true, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };
const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const event = { id: "block-5-x", originalId: 5, type: "block", date: "2026-12-02", startTime: "08:00", endTime: "09:00", title: "Fora" } as never;

afterEach(() => vi.clearAllMocks());

async function editAndSave(block: object, answer: object) {
  calendarApi.getCalendarBlock.mockResolvedValue(block);
  calendarApi.editCalendarBlock.mockResolvedValue({ ...block, ...answer });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EventDetailSheet event={event} open onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByTestId("event-detail-edit"));
  fireEvent.click(await screen.findByTestId("event-detail-save"));
  await waitFor(() => expect(calendarApi.editCalendarBlock).toHaveBeenCalled());
}

describe("a blocker edited from the calendar's block sheet (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar says how many were marked", async () => {
    await editAndSave(blocker, { markedClasses: [wed], coveredClasses: [] });
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "availability.covered.marked:1" }));
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull(); // nothing is asked
    expect(calendarApi.editCalendarBlock).toHaveBeenCalledTimes(1);
  });

  it("[CALENDAR-STUDENT-BLOCKERS-28] a block that answers no marked classes (a coach's own) shows only the ordinary save", async () => {
    await editAndSave({ ...blocker, type: "personal", blocksAutoInvitations: false }, {});
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "calendar.eventDetail.eventUpdated" }));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-28] a failure after the save never says the block was not saved", async () => {
    toast.mockImplementation((arg: { title?: string }) => {
      if (arg.title?.startsWith("availability.covered.marked")) throw new Error("toast broke");
    });
    await editAndSave(blocker, { markedClasses: [wed] });
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "availability.covered.marked:1" }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "calendar.eventDetail.failedUpdateEvent" }));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-32] the student's blocker form says classes in the period are marked; a coach's block does not", async () => {
    calendarApi.getCalendarBlock.mockResolvedValue(blocker);
    const first = render(
      <QueryClientProvider client={new QueryClient()}>
        <EventDetailSheet event={event} open onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByTestId("event-detail-edit"));
    const notice = await screen.findByTestId("blocker-covered-notice");
    expect(notice.textContent).toBe("availability.covered.notice");
    expect(notice.compareDocumentPosition(screen.getByTestId("event-detail-save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();

    calendarApi.getCalendarBlock.mockResolvedValue({ ...blocker, type: "personal", blocksAutoInvitations: false });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventDetailSheet event={event} open onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.click(await screen.findByTestId("event-detail-edit"));
    await screen.findByTestId("event-detail-save");
    expect(screen.queryByTestId("blocker-covered-notice")).toBeNull();
  });
});
