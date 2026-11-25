/**
 * Engine plan item #16 (notifications.class-reminders-manual rule 7): after "send reminders" the sheet
 * names every student the send did not ask, under their cause's words — answered, not coming, or at the
 * reminder limit — and never says "reminders sent to 0". Located by test id; the words are the
 * locale's own (R-013).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";
import i18n from "@/i18n";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({ getApprovalState: vi.fn(), getClassInstance: vi.fn(), sendClassReminders: vi.fn() }));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalState: api.getApprovalState,
  sendClassReminders: api.sendClassReminders,
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
  toast.mockClear();
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [], maxPlayers: 16, invitations: [],
  });
  api.sendClassReminders.mockReset();
});

function renderSheet() {
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
}

const titles = () => toast.mock.calls.map(([arg]) => (arg as { title?: string }).title);

describe("send reminders names the students not asked (engine #16)", () => {
  it("[NOTIFICATIONS-CLASS-REMINDERS-MANUAL-6] names the students not asked under each cause", async () => {
    api.sendClassReminders.mockResolvedValue({
      sent: 0,
      blocked: [
        { playerId: 4, name: "Duarte", cause: "already_confirmed" },
        { playerId: 5, name: "Eva", cause: "not_coming" },
        { playerId: 6, name: "Filipe", cause: "reminder_limit" },
      ],
    });
    renderSheet();
    fireEvent.click(await screen.findByTestId("class-send-reminders"));

    await waitFor(() => expect(api.sendClassReminders).toHaveBeenCalledWith("LessonInstance", "7", "2099-10-19"));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(3));
    expect(titles()).toEqual([
      i18n.t("calendar.notify.remindAlreadyConfirmed", { names: "Duarte" }),
      i18n.t("calendar.notify.remindNotComing", { names: "Eva" }),
      i18n.t("calendar.notify.remindLimitReached", { names: "Filipe" }),
    ]);
    // Each cause has its own words, never a raw key, and nothing reads as "unavailable".
    for (const title of titles()) expect(title).not.toMatch(/^calendar\./);
    expect(titles()).not.toContain(i18n.t("calendar.unavailable.title"));
    expect(titles()).not.toContain(i18n.t("calendar.detail.remindersSent", { count: 0 }));
  });

  it("still says the reminders went out when some were sent", async () => {
    api.sendClassReminders.mockResolvedValue({ sent: 2, blocked: [{ playerId: 5, name: "Eva", cause: "not_coming" }] });
    renderSheet();
    fireEvent.click(await screen.findByTestId("class-send-reminders"));
    await waitFor(() => expect(titles()).toContain(i18n.t("calendar.detail.remindersSent", { count: 2 })));
    expect(titles()).toContain(i18n.t("calendar.notify.remindNotComing", { names: "Eva" }));
  });
});
