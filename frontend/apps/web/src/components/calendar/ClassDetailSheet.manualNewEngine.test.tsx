/**
 * PAD-932 (notifications.manual NM1, NM2): a manual invitation on a new-engine class goes through
 * the engine, so Notificar is back there and the dashboard's `?notify=1` opens the picker, as on an
 * old-engine class. The engine is the class's `engineVersion`, from the calendar event or the class
 * payload. Located by test id (R-013).
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

describe("Notificar on a new-engine class (PAD-932)", () => {
  it("[NOTIFICATIONS-MANUAL-10] shows Notificar and opens on notify=1 on a new-engine class", async () => {
    // The engine on the calendar event: Notificar shows, and the deep link opens the picker.
    await openSheet({ ...event, engineVersion: "new" } as CalendarEvent, true);
    expect(await screen.findByTestId("notify-students-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("class-notify-open")).toBeInTheDocument();
    cleanup();

    // The engine only on the class payload: Notificar stays once it has loaded.
    api.getClassInstance.mockResolvedValue({
      id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
      presences: [], participants: [], maxPlayers: 4, invitations: [], engineVersion: "new",
    });
    await openSheet(event, true);
    expect(await screen.findByTestId("notify-students-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("class-notify-open")).toBeInTheDocument();
    cleanup();

    // An old-engine class, as today.
    api.getClassInstance.mockResolvedValue({
      id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
      presences: [], participants: [], maxPlayers: 4, invitations: [], engineVersion: "old",
    });
    await openSheet(event, true);
    expect(await screen.findByTestId("notify-students-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("class-notify-open")).toBeInTheDocument();
  });
});
