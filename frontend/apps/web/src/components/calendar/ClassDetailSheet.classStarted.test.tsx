/**
 * PAD-798 (notifications.manual rule 10): once a class has started, Notificar gives way to the
 * warning "invitations are closed", and the dashboard's `?notify=1` no longer opens the picker.
 * "Started" is the club's clock (`lisbonNowMs`): the class is 19:30 Lisbon on a summer day, 18:30
 * UTC, and the device clock is pinned. Located by test id (R-013).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  getApprovalSuggestions: vi.fn(),
  getClassInstance: vi.fn(),
  getNotificationGroups: vi.fn(),
}));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalSuggestions: api.getApprovalSuggestions,
  getNotificationGroups: api.getNotificationGroups,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const BEFORE = new Date("2027-07-13T18:00:00Z"); // 19:00 Lisbon
const RUNNING = new Date("2027-07-13T18:45:00Z"); // 19:45 Lisbon; 18:45 < 19:30 if read as UTC

const event = {
  model: "LessonInstance",
  originalId: 7,
  id: "class-7-2027-07-13",
  type: "class",
  isRecurring: false,
  title: "Class",
  date: "2027-07-13",
  startTime: "19:30",
  endTime: "21:00",
  color: "#1355DC",
  openSpot: false,
} as unknown as CalendarEvent;

beforeEach(() => {
  api.getApprovalSuggestions.mockReset().mockResolvedValue({ state: "none" });
  api.getNotificationGroups.mockReset().mockResolvedValue([]);
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
    presences: [], participants: [], maxPlayers: 4, invitations: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openSheet(now: Date, openNotify = false) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event}
          open
          openNotify={openNotify}
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() => expect(api.getClassInstance).toHaveBeenCalled());
}

describe("Notificar once the class has started (PAD-798)", () => {
  it("before the start the coach can open Notificar", async () => {
    await openSheet(BEFORE);
    expect(await screen.findByTestId("class-notify-open")).toBeEnabled();
    expect(screen.queryByTestId("class-notify-closed")).toBeNull();
  });

  it("once it has started the warning stands where Notificar was", async () => {
    await openSheet(RUNNING);
    expect(await screen.findByTestId("class-notify-closed")).toBeInTheDocument();
    expect(screen.queryByTestId("class-notify-open")).toBeNull();
  });

  it("the dashboard's ?notify=1 does not open the picker on a class that has started", async () => {
    await openSheet(RUNNING, true);
    await screen.findByTestId("class-notify-closed");
    expect(screen.queryByTestId("notify-students-dialog")).toBeNull();
  });

  it("before the start ?notify=1 still opens the picker", async () => {
    await openSheet(BEFORE, true);
    expect(await screen.findByTestId("notify-students-dialog")).toBeInTheDocument();
  });
});
