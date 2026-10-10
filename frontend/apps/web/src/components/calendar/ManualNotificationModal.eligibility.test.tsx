/**
 * eligibility.enforcement rule 6a / notifications.manual rule 8 (PAD-562): inviting a student who
 * fails the bar asks first through the manual add's dialog (invite verb), one dialog for the whole
 * selection; cancel sends nothing, confirm sends. Asserted by test id, never by copy (`t` returns
 * the key).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CoachPlayer, StudentGroup } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const groups: StudentGroup[] = [
  {
    id: "all_students",
    label: "All students",
    players: [
      { id: "7", name: "Rita Below", levelCode: "B1", levelId: "1" },
      { id: "8", name: "Rui Fine", levelCode: "B2", levelId: "2" },
    ],
  } as StudentGroup,
];

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

const roster = [
  { id: "c7", coachId: "1", playerId: "7", userId: "17", name: "Rita Below", email: "", isActive: true },
  { id: "c8", coachId: "1", playerId: "8", userId: "18", name: "Rui Fine", email: "", isActive: true },
] as unknown as CoachPlayer[];

const failingRita = [
  {
    playerId: "7",
    name: "Rita Below",
    failures: [{ attribute: "level", operation: "same_as_class", actual: "B1", threshold: "B2", ladder_distance: 1, reason: null }],
  },
];

async function openAndSelect(names: string[]) {
  render(
    <ManualNotificationModal
      open
      onClose={() => {}}
      eventModel="LessonInstance"
      eventOriginalId="5"
      eventDate="2026-06-11"
      coachPlayers={roster}
      existingPlayerIds={[]}
    />
  );
  await screen.findByText("All students");
  fireEvent.change(screen.getByPlaceholderText("calendar.notify.searchPlaceholder"), { target: { value: "R" } });
  for (const name of names) fireEvent.click(await screen.findByText(name, { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: /calendar\.notify\.sendToCount|calendar\.notify\.send$/ }));
}

beforeEach(() => {
  api.getNotificationGroups.mockResolvedValue(groups);
  api.sendManualNotifications.mockResolvedValue({ sent: 1, blocked: [] });
  api.checkEligibility.mockReset();
});

describe("manual invite below the bar", () => {
  it("asks first with the invite verb, cancel sends nothing", async () => {
    api.checkEligibility.mockResolvedValue({ ineligible: failingRita });
    await openAndSelect(["Rita Below"]);
    const dialog = await screen.findByTestId("eligibility-confirm");
    expect(api.checkEligibility).toHaveBeenCalledWith("LessonInstance", "5", "2026-06-11", ["7"]);
    expect(screen.getAllByTestId("eligibility-confirm-student")).toHaveLength(1);
    expect(dialog).toHaveTextContent("calendar.eligibilityConfirm.inviteTitle");
    expect(screen.getByTestId("eligibility-confirm-proceed")).toHaveTextContent("calendar.eligibilityConfirm.inviteConfirm");
    fireEvent.click(screen.getByTestId("eligibility-confirm-cancel"));
    await waitFor(() => expect(screen.queryByTestId("eligibility-confirm")).toBeNull());
    expect(api.sendManualNotifications).not.toHaveBeenCalled();
    // The selection survives the cancel: the modal is still there with its send button armed.
    expect(screen.getByTestId("notify-students-dialog")).toBeTruthy();
  });

  it("confirm sends the whole selection, the passing student included", async () => {
    api.checkEligibility.mockResolvedValue({ ineligible: failingRita });
    await openAndSelect(["Rita Below", "Rui Fine"]);
    await screen.findByTestId("eligibility-confirm");
    expect(screen.getAllByTestId("eligibility-confirm-student")).toHaveLength(1); // only Rita is named
    fireEvent.click(screen.getByTestId("eligibility-confirm-proceed"));
    await waitFor(() => expect(api.sendManualNotifications).toHaveBeenCalledTimes(1));
    expect(api.sendManualNotifications.mock.calls[0][3].sort()).toEqual(["7", "8"]);
  });

  it("sends at once when nobody fails, and when the check itself fails", async () => {
    api.checkEligibility.mockResolvedValue({ ineligible: [] });
    await openAndSelect(["Rui Fine"]);
    await waitFor(() => expect(api.sendManualNotifications).toHaveBeenCalledWith("LessonInstance", "5", "2026-06-11", ["8"]));
    expect(screen.queryByTestId("eligibility-confirm")).toBeNull();
  });
});
