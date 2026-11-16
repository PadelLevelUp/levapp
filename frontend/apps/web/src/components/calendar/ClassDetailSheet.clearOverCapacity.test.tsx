/**
 * PAD-567 (attendance.validation rule 26, PAD-857): clearing an absence on a class whose freed seat
 * was taken opens the over-capacity dialog BEFORE anything is saved; the clear is only sent once
 * the coach confirms. Located by test id (R-013).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  getClassInstance: vi.fn(),
  confirmClassPresences: vi.fn(),
  getApprovalState: vi.fn(),
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
vi.mock("@/api/presences", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  confirmClassPresences: api.confirmClassPresences,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

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

// One place; Ana is absent (her seat reopened), Bea has since taken it.
const ANA = 1;
const BEA = 2;
const presence = (playerId: number, status: string, extra: Record<string, unknown> = {}) => ({
  id: playerId, playerId, lessonInstanceId: 7, status, validated: true, ...extra,
});

beforeEach(() => {
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getNotificationGroups.mockReset().mockResolvedValue([]);
  api.confirmClassPresences.mockReset().mockResolvedValue({
    presences: [], notifiedPlayers: [], invitationsQueued: false, approvalBundle: null,
  });
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
    maxPlayers: 1, invitations: [],
    participants: [
      { id: ANA, user: { name: "Ana" } },
      { id: BEA, user: { name: "Bea" } },
    ],
    presences: [
      presence(ANA, "absent", { justification: "justified", attendanceState: "not_coming" }),
      presence(BEA, "present", { attendanceState: "coming" }),
    ],
  });
});

afterEach(cleanup);

async function clearAnasAbsence() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event}
          open
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
  fireEvent.click(await screen.findByTestId("attendance-edit"));
  const rows = await screen.findAllByTestId("attendance-row");
  // Pressing the selected mark again clears it (PAD-567).
  fireEvent.click(rows[0].querySelector('[data-testid="attendance-absent"]') as HTMLElement);
  fireEvent.click(screen.getByTestId("attendance-save"));
}

describe("Clearing an absence into a full class (PAD-567 rule 26)", () => {
  it("[ATTENDANCE-VALIDATION-40] the dialog warns before the clear is saved, and nothing is sent yet", async () => {
    await clearAnasAbsence();
    expect(await screen.findByTestId("attendance-clear-over-capacity-confirm")).toBeInTheDocument();
    expect(api.confirmClassPresences).not.toHaveBeenCalled();
  });

  it("[ATTENDANCE-VALIDATION-40] confirming sends the clear", async () => {
    await clearAnasAbsence();
    fireEvent.click(await screen.findByTestId("attendance-clear-over-capacity-confirm"));
    await waitFor(() => expect(api.confirmClassPresences).toHaveBeenCalledTimes(1));
    const payload = api.confirmClassPresences.mock.calls[0][1];
    expect(payload).toContainEqual({ playerId: String(ANA), clear: true });
  });
});
