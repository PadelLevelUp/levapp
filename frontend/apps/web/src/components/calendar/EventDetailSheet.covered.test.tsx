/**
 * calendar.student-blockers rule 19-21, criterion -28 (PAD-772): a student's availability blocker edited
 * from the calendar's block sheet asks the same question after the save, and marks only on yes; a block
 * whose save answers no `coveredClasses` (a coach's own) asks nothing. `t` returns the key.
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
const availabilityApi = vi.hoisted(() => ({ declineCoveredClasses: vi.fn() }));
vi.mock("@/api/availability", () => availabilityApi);

import { EventDetailSheet } from "./EventDetailSheet";

const blocker = { id: 5, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };
const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
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
  it("[CALENDAR-STUDENT-BLOCKERS-28] a blocker edited from the calendar asks after the save", async () => {
    availabilityApi.declineCoveredClasses.mockResolvedValue({ declined: [{ model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 1 }], skipped: [] });
    await editAndSave(blocker, { coveredClasses: [wed] });
    await screen.findByTestId("blocker-covered-dialog");
    expect(screen.getByTestId("blocker-covered-item-0").textContent).toContain("Quarta");
    // Keep marks nothing; asking again and answering yes posts the class.
    fireEvent.click(screen.getByTestId("blocker-covered-keep"));
    await waitFor(() => expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull());
    expect(availabilityApi.declineCoveredClasses).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("event-detail-edit"));
    calendarApi.editCalendarBlock.mockResolvedValue({ ...blocker, coveredClasses: [wed] });
    fireEvent.click(await screen.findByTestId("event-detail-save"));
    await screen.findByTestId("blocker-covered-dialog");
    fireEvent.click(screen.getByTestId("blocker-covered-decline"));
    await waitFor(() =>
      expect(availabilityApi.declineCoveredClasses).toHaveBeenCalledWith({ occurrences: [{ model: "Lesson", originalId: 7, date: "2026-12-02" }] })
    );
  });

  it("[CALENDAR-STUDENT-BLOCKERS-28] a failure after the save never says the block was not saved", async () => {
    availabilityApi.declineCoveredClasses.mockResolvedValue({ declined: [{ model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 1 }], skipped: [] });
    toast.mockImplementation((arg: { title?: string }) => {
      if (arg.title?.startsWith("availability.covered.marked")) throw new Error("toast broke");
    });
    await editAndSave(blocker, { coveredClasses: [wed] });
    await screen.findByTestId("blocker-covered-dialog");
    fireEvent.click(screen.getByTestId("blocker-covered-decline"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "availability.covered.marked:1" })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "calendar.eventDetail.failedUpdateEvent" }));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-28] a block that answers no covered classes (a coach's own) asks nothing", async () => {
    await editAndSave({ ...blocker, type: "personal" }, {});
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "calendar.eventDetail.eventUpdated" }));
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull();
  });
});
