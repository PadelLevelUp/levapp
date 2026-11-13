/**
 * PAD-933 (notifications.manual NM2, owner decision 17): manual invites do not go through the new
 * engine yet, so a new-engine class offers no Notificar and the dashboard's `?notify=1` opens
 * nothing. The engine is the class's `engineVersion`, from the calendar event or the class
 * payload; a payload without it reads as `old`. Located by test id (R-013).
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
  getApprovalState: vi.fn(),
  getClassInstance: vi.fn(),
  getNotificationGroups: vi.fn(),
}));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalState: api.getApprovalState,
  getNotificationGroups: api.getNotificationGroups,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const BEFORE = new Date("2027-07-13T18:00:00Z"); // 19:00 Lisbon

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
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
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

async function openSheet(ev: CalendarEvent, openNotify = false, now: Date = BEFORE) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={ev}
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

describe("Notificar on a new-engine class (PAD-933)", () => {
  it("[NOTIFICATIONS-MANUAL-10] a new-engine class has no Notificar and ?notify=1 opens nothing", async () => {
    // The engine on the calendar event: no Notificar, and the deep link opens no picker.
    await openSheet({ ...event, engineVersion: "new" } as CalendarEvent, true);
    await screen.findByTestId("class-edit");
    expect(screen.queryByTestId("class-notify-open")).toBeNull();
    expect(screen.queryByTestId("notify-students-dialog")).toBeNull();
    cleanup();

    // The engine only on the class payload: the same once it has loaded.
    api.getClassInstance.mockResolvedValue({
      id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
      presences: [], participants: [], maxPlayers: 4, invitations: [], engineVersion: "new",
    });
    await openSheet(event);
    await waitFor(() => expect(screen.queryByTestId("class-notify-open")).toBeNull());

    // No engineVersion anywhere reads as old: Notificar stays and ?notify=1 opens the picker.
    cleanup();
    api.getClassInstance.mockResolvedValue({
      id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
      presences: [], participants: [], maxPlayers: 4, invitations: [],
    });
    await openSheet(event, true);
    expect(await screen.findByTestId("notify-students-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("class-notify-open")).toBeInTheDocument();
  });
});
