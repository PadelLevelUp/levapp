/**
 * eligibility.rules rule 13 on a class (eligibility.cascade): the class Save refuses a bar rule with no
 * value, before the overlap or scope dialog and with nothing sent, but only when the edit would send the
 * class's bar. Picking the class's own bar copies the effective bar (`tierValueFor`), so a coach bar
 * holding a blank rule is how the blank reaches the class here. Located by test id (R-013).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));
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
// Edit mode lists the courts; no network in a unit test.
vi.mock("@/api/courts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listCourtsForClass: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const BLANK = { attribute: "attendance_rate", operation: "greater_than" };

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

function instance(own: unknown) {
  return {
    id: 7, name: "Class", date: "2027-07-13", startTime: "19:30", endTime: "21:00", status: "scheduled",
    presences: [], participants: [], maxPlayers: 4, invitations: [],
    eligibilityRules: own,
    effectiveEligibilityRules: own ?? [BLANK],
    eligibilitySource: own == null ? "coach" : "class",
  };
}

beforeEach(() => {
  toastSpy.mockReset();
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getNotificationGroups.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function editClass(own: unknown) {
  api.getClassInstance.mockResolvedValue(instance(own));
  const onEdit = vi.fn();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-07-10T10:00:00Z"));
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
          onEdit={onEdit}
          existingEvents={[]}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByTestId("class-edit"));
  await screen.findByTestId("class-edit-save");
  return onEdit;
}
const pick = (mode: string) => fireEvent.click(screen.getByTestId(`class-eligibility-mode-${mode}`));
const save = () => fireEvent.click(screen.getByTestId("class-edit-save"));

describe("a class bar rule with no value (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-21] a class bar rule with no value blocks the class save, only when sent", async () => {
    // The class's own bar, holding a blank rule: refused with the reason, nothing sent, no dialog.
    let onEdit = await editClass(null);
    pick("custom");
    expect(await screen.findByTestId("eligibility-value-missing")).toBeInTheDocument();
    save();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Elegibilidade: há uma regra sem valor.", variant: "destructive" })),
    );
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // Switching to everyone after the blank row saves `[]`.
    pick("everyone");
    save();
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    expect(onEdit.mock.calls[0][1]).toEqual({ eligibilityRules: [] });
    cleanup();

    // A class whose own bar is stored blank: switching it to the standard bar saves `null`.
    onEdit = await editClass([BLANK]);
    pick("standard");
    save();
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    expect(onEdit.mock.calls[0][1]).toEqual({ eligibilityRules: null });
    cleanup();

    // A name-only edit of a class whose stored bar already holds a blank rule saves.
    toastSpy.mockReset();
    onEdit = await editClass([BLANK]);
    fireEvent.change(screen.getByTestId("class-edit-name"), { target: { value: "Renamed" } });
    save();
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    expect(onEdit.mock.calls[0][1]).toEqual({ name: "Renamed" });
    expect(toastSpy).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Elegibilidade: há uma regra sem valor." }));
  });
});
