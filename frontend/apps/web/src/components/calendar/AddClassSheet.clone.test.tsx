/**
 * classes.clone (PAD-524): a clone opens the ordinary new-class sheet prefilled, with the start
 * empty and Create disabled until one is chosen — and its save is the ordinary create. The
 * prefill cannot bypass create's checks: a slot over another class still asks first (PAD-99),
 * and a student marked unavailable still asks first (PAD-107).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CloneTemplate } from "@levelup/types";
import type { CalendarEvent } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/api/courts", () => ({ listCurrentClubCourts: () => Promise.resolve([]) }));
vi.mock("@/hooks/useAutoInviteEnabled", () => ({ useAutoInviteEnabled: () => false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  seasonsApi: { getSeason: () => Promise.resolve(null) },
}));
const conflicts = vi.fn();
vi.mock("@/api/notificationEngine", () => ({
  checkAvailabilityConflicts: (...args: unknown[]) => conflicts(...args),
}));

import { AddClassSheet } from "./AddClassSheet";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const CLONE: CloneTemplate = {
  name: "Quinta 18h", classType: "academy", levelId: null, maxPlayers: 4, color: "#112233",
  courtId: null, date: "2026-11-05", durationMinutes: 60, notificationsEnabled: true,
  eligibilityRules: [{ attribute: "level", operation: "same_as_class" } as never],
  openSpotsVisible: false, autoInvites: true, isRecurring: true,
  recurrenceRule: { frequency: "weekly", daysOfWeek: [4] }, recursUntilSeasonEnd: false,
  endDate: "2026-12-17", playerIds: ["7"],
};

const OTHER_CLASS = {
  id: "lesson-99", type: "class", title: "Other", date: "2026-11-05", startTime: "19:30", endTime: "20:30",
} as unknown as CalendarEvent;

function renderSheet(onSave: (data: unknown) => void, existingEvents: CalendarEvent[] = []) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddClassSheet open onClose={() => {}} onSave={onSave} players={[]} levels={[]} clone={CLONE} existingEvents={existingEvents} />
    </QueryClientProvider>
  );
}

function pickStart(value: string) {
  const start = screen.getByTestId("add-class-start-time") as HTMLInputElement;
  fireEvent.change(start, { target: { value } });
  fireEvent.blur(start);
}

describe("a clone is the ordinary create, prefilled (PAD-524)", () => {
  it("opens with the start empty and Create disabled until one is chosen; the end follows the length", async () => {
    conflicts.mockResolvedValue([]);
    const onSave = vi.fn();
    renderSheet(onSave);
    const start = screen.getByTestId("add-class-start-time") as HTMLInputElement;
    await waitFor(() => expect(start.value).toBe(""));
    expect(screen.getByTestId("add-class-create")).toBeDisabled();
    expect(screen.getByTestId("add-class-start-hint")).toBeInTheDocument();
    pickStart("18:00");
    await waitFor(() => expect((screen.getByTestId("add-class-end-time") as HTMLInputElement).value).toBe("19:00"));
    expect(screen.getByTestId("add-class-create")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("add-class-create"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = onSave.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      name: "Quinta 18h", date: "2026-11-05", startTime: "18:00", endTime: "19:00", isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [4] }, playerIds: ["7"],
      eligibilityRules: CLONE.eligibilityRules, openSpotsVisible: false, autoInvites: true,
    });
  });

  it("still asks before scheduling over another class (PAD-99)", async () => {
    conflicts.mockResolvedValue([]);
    const onSave = vi.fn();
    renderSheet(onSave, [OTHER_CLASS]);
    pickStart("19:00");
    await waitFor(() => expect(screen.getByTestId("add-class-create")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("add-class-create"));
    expect(await screen.findByTestId("overlap-warning-description")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("still asks before booking a student who marked themselves unavailable (PAD-107)", async () => {
    conflicts.mockResolvedValue([{ playerId: "7", name: "Ana" }]);
    const onSave = vi.fn();
    renderSheet(onSave);
    pickStart("10:00");
    await waitFor(() => expect(screen.getByTestId("add-class-create")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("add-class-create"));
    expect(await screen.findByTestId("unavailable-student-dialog")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
