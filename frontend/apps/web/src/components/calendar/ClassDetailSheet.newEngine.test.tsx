/**
 * PAD-920 (calendar.event-detail ND1–ND3): a new-engine session's invitee rows on web. Labels come
 * from the shared helper; a new-engine row's id names its outcome; "N pending" counts only the
 * invitations that still count. Asserted by test id and i18n key (`t` returns the key).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTranslation: () => ({ t: (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key), i18n: { language: "pt" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
const live = vi.hoisted(() => ({ handler: null as null | ((data: unknown) => void) }));
vi.mock("@/api/events", () => ({
  subscribeAppEvents: (_token: string, handler: (data: unknown) => void) => {
    live.handler = handler;
    return () => undefined;
  },
}));
const api = vi.hoisted(() => ({
  getApprovalState: vi.fn(),
  getClassInstance: vi.fn(),
  coachRespondToEngineInvitation: vi.fn(),
  coachRespondToNotification: vi.fn(),
  withdrawEngineInvitation: vi.fn(),
  withdrawInvitation: vi.fn(),
}));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalState: api.getApprovalState,
  coachRespondToEngineInvitation: api.coachRespondToEngineInvitation,
  coachRespondToNotification: api.coachRespondToNotification,
  withdrawEngineInvitation: api.withdrawEngineInvitation,
  withdrawInvitation: api.withdrawInvitation,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = {
  model: "LessonInstance",
  originalId: 7,
  id: "class-7-2099-10-19",
  type: "class",
  isRecurring: false,
  title: "Class",
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  color: "#1355DC",
  openSpot: false,
} as unknown as CalendarEvent;

beforeEach(() => {
  live.handler = null;
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [], maxPlayers: 2,
    invitations: [
      { id: 1, playerId: "1", playerName: "P1", status: "sent", outcome: "pending", answer: null, answeredBy: null, tierSource: "coach_list", groupNumber: null },
      { id: 2, playerId: "2", playerName: "P2", status: "sent", outcome: "pending", answer: null, answeredBy: null, tierSource: "pool", groupNumber: 2 },
      { id: 3, playerId: "3", playerName: "P3", status: "sent", outcome: "pending", answer: null, answeredBy: null, tierSource: "students_list", groupNumber: null, reopenedAt: "2099-10-18T10:00:00" },
      { id: 4, playerId: "4", playerName: "P4", status: "sent", outcome: "not_counting", answer: null, answeredBy: null, tierSource: "pool", groupNumber: 1 },
      { id: 5, playerId: "5", playerName: "P5", status: "sent", outcome: "not_counting", answer: null, answeredBy: null, tierSource: null, groupNumber: null },
      { id: 6, playerId: "6", playerName: "P6", status: "expired", outcome: "sorry", answer: null, answeredBy: null, tierSource: "pool", groupNumber: 1 },
      { id: 7, playerId: "7", playerName: "P7", status: "expired", outcome: "closed_same_hour", answer: null, answeredBy: null, tierSource: "pool", groupNumber: 1 },
      { id: 8, playerId: "8", playerName: "P8", status: "expired", outcome: "cancelled", answer: null, answeredBy: null, tierSource: "pool", groupNumber: 1 }
    ],
  });
});

async function openSheet() {
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
  await waitFor(() => expect(screen.getByTestId("class-invited-toggle")).toBeTruthy());
}

describe("PAD-920 the new engine's invitees on web", () => {
  it("[CALENDAR-EVENT-DETAIL-35] labels the new engine's outcomes from the shared helper", async () => {
    await openSheet();
    // Two open spots, three counting invitations: "N pending" is 3, not 5.
    expect(screen.getByText(/calendar\.detail\.openSpotsPending/).textContent).toContain('"pending":3');
    fireEvent.click(screen.getByTestId("class-invited-toggle"));

    const label = (pid: string, outcome: string) => screen.getByTestId(`invitee-outcome-${pid}-${outcome}`).textContent;
    expect(label("1", "pending")).toBe("calendar.detail.outcomePending");
    expect(label("4", "not_counting")).toBe("calendar.detail.outcomeNotCounting");
    expect(label("6", "sorry")).toBe("calendar.detail.outcomeSorry");
    expect(label("7", "closed_same_hour")).toBe("calendar.detail.outcomeClosedSameHour");
    expect(label("8", "cancelled")).toBe("calendar.detail.outcomeCancelled");
    // The old-engine id is not used on a new-engine row.
    expect(screen.queryByTestId("invitee-outcome-1")).toBeNull();

    // The tier and reopened notes show under the label.
    expect(screen.getByTestId("invitee-tier-1").textContent).toBe("calendar.detail.tierCoachList");
    expect(screen.getByTestId("invitee-tier-2").textContent).toBe('calendar.detail.tierGroup:{"n":2}');
    expect(screen.getByTestId("invitee-tier-5").textContent).toBe("calendar.detail.tierManual");
    expect(within(screen.getByTestId("invitee-row-3")).getByTestId("invitee-reopened-3").textContent).toBe("calendar.detail.reopened");
  });

  it("shows a new-engine session's pending request on the class, with Ignorar", async () => {
    api.getApprovalState.mockResolvedValue({
      engine: "new", state: "pending", semiAutomatic: true, approvedGroups: [], dismissedGroups: [], removed: [],
      requests: [{ requestId: 42, lessonInstanceId: 7, group: { tierSource: "pool", groupNumber: 1 }, spotTypes: [
        { side: "left", levelId: null, levelLabel: null, queue: [{ playerId: "s1", name: "Rita", tier: 2, rank: 1 }] },
      ] }],
    });
    await openSheet();
    await waitFor(() => expect(screen.getByTestId("approval-yes")).toBeTruthy());
    expect(screen.getByTestId("approval-dismiss")).toBeTruthy();
  });

  it("[NOTIFICATIONS-INVITATIONS-122] records a coach's answer and a withdrawal by the invitation's id", async () => {
    api.coachRespondToEngineInvitation.mockResolvedValue({ action: "confirmed", invitationId: 1 });
    api.withdrawEngineInvitation.mockResolvedValue({ action: "withdrawn" });
    await openSheet();
    fireEvent.click(screen.getByTestId("class-invited-toggle"));
    const openMenu = () => fireEvent.keyDown(screen.getByTestId("invitee-actions-1"), { key: "Enter" });

    openMenu();
    fireEvent.click(await screen.findByTestId("invitee-mark-accepted"));
    await waitFor(() => expect(api.coachRespondToEngineInvitation).toHaveBeenCalledWith({ invitationId: 1, action: "yes" }));
    expect(api.coachRespondToNotification).not.toHaveBeenCalled();
  });

  it("[NOTIFICATIONS-INVITATIONS-122] withdraws a new-engine invitation through the engine's route", async () => {
    api.withdrawEngineInvitation.mockResolvedValue({ action: "withdrawn" });
    await openSheet();
    fireEvent.click(screen.getByTestId("class-invited-toggle"));
    fireEvent.keyDown(screen.getByTestId("invitee-actions-2"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("invitee-delete"));
    fireEvent.click(await screen.findByTestId("invitee-delete-confirm"));
    await waitFor(() => expect(api.withdrawEngineInvitation).toHaveBeenCalledWith(2));
    expect(api.withdrawInvitation).not.toHaveBeenCalled();
  });
});
