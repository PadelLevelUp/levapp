/**
 * PAD-934 (calendar.view rule 23): a student on a class's waiting list can leave it from the class
 * detail opened on the Calendar. One confirm, the existing leave endpoint, then the join offer is back
 * and the calendar is read again. Located by test id (R-013).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["player"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  leaveClassWaitingList: vi.fn(),
  joinClassWaitingList: vi.fn(),
  getClassInstance: vi.fn(),
}));
vi.mock("@/api/academyClasses", () => ({
  leaveClassWaitingList: api.leaveClassWaitingList,
  joinClassWaitingList: api.joinClassWaitingList,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "LessonInstance",
    originalId: 7,
    id: "class-7-2099-10-19",
    type: "class",
    isRecurring: false,
    title: "PEAK PERFORMANCE",
    date: "2099-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: "#1355DC",
    openSpot: true,
    studentRelation: "waiting",
    ...extra,
  }) as CalendarEvent;

const instance = {
  id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
  presences: [], participants: [], maxPlayers: 4,
};

function renderSheet(ev: CalendarEvent) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClassDetailSheet
          event={ev} open onClose={() => undefined} players={[]} levels={[]} canManage={false}
          onDelete={() => undefined} onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return invalidate;
}

beforeEach(() => {
  api.leaveClassWaitingList.mockReset().mockResolvedValue({ lessonInstanceId: 7, onWaitingList: false });
  toast.mockClear();
  api.getClassInstance.mockReset().mockResolvedValue({ ...instance });
});

describe("leaving the waiting list from the class detail (PAD-934)", () => {
  it("[CALENDAR-VIEW-27] a student on the waiting list leaves it from the class detail", async () => {
    const invalidate = renderSheet(event());
    expect(await screen.findByTestId("class-waiting-list-on")).toBeTruthy();
    // Asked once: answering no changes nothing.
    fireEvent.click(screen.getByTestId("class-waiting-list-leave"));
    fireEvent.click(screen.getByTestId("class-waiting-list-leave-no"));
    expect(api.leaveClassWaitingList).not.toHaveBeenCalled();
    expect(screen.getByTestId("class-waiting-list-on")).toBeTruthy();
    // Yes: the existing endpoint with the instance id, the join offer is back, the calendar re-read.
    fireEvent.click(screen.getByTestId("class-waiting-list-leave"));
    fireEvent.click(screen.getByTestId("class-waiting-list-leave-yes"));
    await waitFor(() => expect(api.leaveClassWaitingList).toHaveBeenCalledWith(7));
    expect(api.leaveClassWaitingList).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("class-waiting-list-join")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-on")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendar-events"] });
  });

  it("[CALENDAR-VIEW-27] a 404 (already gone) is no error; any other failure keeps the block and says so", async () => {
    api.leaveClassWaitingList.mockRejectedValueOnce({ response: { status: 404 } });
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-waiting-list-leave"));
    fireEvent.click(screen.getByTestId("class-waiting-list-leave-yes"));
    expect(await screen.findByTestId("class-waiting-list-join")).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
  });

  it("[CALENDAR-VIEW-27] a failed leave keeps the waiting-list block and toasts", async () => {
    api.leaveClassWaitingList.mockRejectedValueOnce({ response: { status: 500 } });
    renderSheet(event());
    fireEvent.click(await screen.findByTestId("class-waiting-list-leave"));
    fireEvent.click(screen.getByTestId("class-waiting-list-leave-yes"));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.getByTestId("class-waiting-list-on")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-join")).toBeNull();
  });

  it("[CALENDAR-VIEW-27] a full class the student is not on offers no leave", async () => {
    renderSheet(event({ studentRelation: "full" }));
    expect(await screen.findByTestId("class-waiting-list-join")).toBeTruthy();
    expect(screen.queryByTestId("class-waiting-list-leave")).toBeNull();
  });
});
