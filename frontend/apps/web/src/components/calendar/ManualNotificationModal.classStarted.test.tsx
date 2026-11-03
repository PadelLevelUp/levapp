/**
 * PAD-798 (notifications.manual rule 10): a picker left open across the class's start sends and the
 * server answers 409 CLASS_STARTED. The coach reads "invitations are closed", not the generic
 * failure, and the picker closes. Asserted by key (`t` returns the key).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachPlayer, StudentGroup } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const api = vi.hoisted(() => ({
  getNotificationGroups: vi.fn(),
  sendManualNotifications: vi.fn(),
  checkEligibility: vi.fn(),
}));
vi.mock("@/api/notificationEngine", () => api);

import { ManualNotificationModal } from "./ManualNotificationModal";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const groups = [
  { id: "all_students", label: "All students", players: [{ id: "8", name: "Rui Fine", levelCode: "B2", levelId: "2" }] },
] as unknown as StudentGroup[];
const roster = [
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Fine", email: "", isActive: true },
] as unknown as CoachPlayer[];

const refusal = (status: number, code?: string) =>
  Object.assign(new Error("refused"), { response: { status, data: { error: code, code } } });

async function send(onClose: () => void) {
  render(
    <ManualNotificationModal
      open
      onClose={onClose}
      eventModel="LessonInstance"
      eventOriginalId="5"
      eventDate="2027-07-13"
      coachPlayers={roster}
      existingPlayerIds={[]}
    />
  );
  await screen.findByText("All students");
  fireEvent.change(screen.getByPlaceholderText("calendar.notify.searchPlaceholder"), { target: { value: "R" } });
  fireEvent.click(await screen.findByText("Rui Fine", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /calendar\.notify\.sendToCount|calendar\.notify\.send$/ }));
}

beforeEach(() => {
  api.getNotificationGroups.mockResolvedValue(groups);
  api.checkEligibility.mockResolvedValue({ ineligible: [] });
  api.sendManualNotifications.mockReset();
  toast.error.mockReset();
});

describe("the class started while the picker was open (PAD-798)", () => {
  it("409 CLASS_STARTED reads 'invitations are closed' and closes the picker", async () => {
    api.sendManualNotifications.mockRejectedValue(refusal(409, "CLASS_STARTED"));
    const onClose = vi.fn();
    await send(onClose);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("calendar.notify.classStarted"));
    expect(toast.error).not.toHaveBeenCalledWith("calendar.notify.failedSendInvitations");
    expect(onClose).toHaveBeenCalled();
  });

  it("any other failure keeps the generic message", async () => {
    api.sendManualNotifications.mockRejectedValue(refusal(500));
    await send(vi.fn());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("calendar.notify.failedSendInvitations"));
  });
});
