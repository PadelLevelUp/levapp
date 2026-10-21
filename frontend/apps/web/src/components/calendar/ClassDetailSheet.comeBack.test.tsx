/**
 * PAD-684 (attendance.confirm rule 28): a `not_coming` student's class detail renders the SERVER's
 * `comeBack` - "Afinal vou", the spot-taken line + waiting-list join, the waiting-list state, or
 * (an older server, no field) the PAD-570 hint. Located by test id (R-013).
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
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
  respondToReminder: vi.fn(),
  getClassInstance: vi.fn(),
}));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: api.joinClassWaitingList }));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  respondToReminder: api.respondToReminder,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = {
  model: "ClassInstance",
  originalId: 7,
  id: "class-7-2099-10-19",
  type: "class",
  isRecurring: false,
  title: "PEAK PERFORMANCE",
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  color: "#1355DC",
  openSpot: false,
  studentRelation: "enrolled",
} as unknown as CalendarEvent;

const notComing = {
  id: 1,
  lessonInstanceId: 7,
  attendanceState: "not_coming",
  status: "absent",
  justification: "justified",
};
const instance = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  status: "scheduled",
  presences: [notComing],
  participants: [],
  maxPlayers: 4,
  ...extra,
});

function renderSheet() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event}
          open
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage={false}
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.joinClassWaitingList.mockClear();
  api.respondToReminder.mockReset().mockResolvedValue({ action: "confirmed" });
  toast.mockClear();
  api.getClassInstance.mockReset();
});

describe("Afinal vou (PAD-684)", () => {
  it("rejoin: the button answers yes for the occurrence", async () => {
    api.getClassInstance.mockResolvedValue(instance({ comeBack: "rejoin" }));
    renderSheet();
    fireEvent.click(await screen.findByTestId("attendance-come-back"));
    await waitFor(() => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes"));
    expect(screen.queryByTestId("class-declined-hint")).toBeNull();
  });

  it("rejoin refused with spot_filled: shows the waiting-list branch without a reload", async () => {
    api.getClassInstance
      .mockResolvedValueOnce(instance({ comeBack: "rejoin" }))
      .mockResolvedValue(instance({ comeBack: "waiting_list" }));
    api.respondToReminder.mockResolvedValue({ action: "spot_filled" });
    renderSheet();
    fireEvent.click(await screen.findByTestId("attendance-come-back"));
    expect(await screen.findByTestId("attendance-come-back-spot-taken")).toBeTruthy();
    expect(screen.getByTestId("attendance-come-back-waiting-list")).toBeTruthy();
  });

  it("waiting_list: the spot-taken line and the join for this occurrence", async () => {
    api.getClassInstance
      .mockResolvedValueOnce(instance({ comeBack: "waiting_list" }))
      .mockResolvedValue(instance({ comeBack: "on_waiting_list" }));
    renderSheet();
    expect(await screen.findByTestId("attendance-come-back-spot-taken")).toBeTruthy();
    expect(screen.queryByTestId("attendance-come-back")).toBeNull();
    fireEvent.click(screen.getByTestId("attendance-come-back-waiting-list"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(event));
    expect(await screen.findByTestId("attendance-come-back-on-waiting-list")).toBeTruthy();
  });

  it("on_waiting_list: the state line and no button", async () => {
    api.getClassInstance.mockResolvedValue(instance({ comeBack: "on_waiting_list" }));
    renderSheet();
    expect(await screen.findByTestId("attendance-come-back-on-waiting-list")).toBeTruthy();
    expect(screen.queryByTestId("attendance-come-back")).toBeNull();
    expect(screen.queryByTestId("attendance-come-back-waiting-list")).toBeNull();
  });

  it("no comeBack field (older server) + not_coming: the PAD-570 hint, no come-back control", async () => {
    api.getClassInstance.mockResolvedValue(instance());
    renderSheet();
    expect(await screen.findByTestId("class-declined-hint")).toBeTruthy();
    expect(screen.queryByTestId("attendance-come-back")).toBeNull();
    expect(screen.queryByTestId("attendance-come-back-waiting-list")).toBeNull();
  });
});
